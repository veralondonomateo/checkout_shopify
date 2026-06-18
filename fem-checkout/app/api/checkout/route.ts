import { NextRequest, NextResponse } from "next/server";
import MercadoPagoConfig, { Preference } from "mercadopago";
import { OrderItem } from "@/types/checkout";
import { createServerClient } from "@/lib/supabase";
import { sendPurchaseEvent } from "@/lib/meta";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// Source of truth for coupon codes — never trust client-sent discount amounts
const COUPON_CODES: Record<string, number> = {
  FEM10: 0.1,
  MISTERIOSO: 0.05,
  AIDA: 0.2,
};

interface CheckoutBody {
  email: string;
  firstName: string;
  lastName: string;
  cedula?: string;
  phone: string;
  address: string;
  complement?: string;
  state: string;
  city: string;
  paymentMethod: "mercadopago" | "contraentrega";
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  couponCode?: string;
  discount?: number;
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://checkoutfem.com";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: "La orden no tiene productos" }, { status: 400 });
  }

  if (!["mercadopago", "contraentrega"].includes(body.paymentMethod)) {
    return NextResponse.json({ error: "Método de pago inválido" }, { status: 400 });
  }

  // Ciudades de difícil acceso: solo pago anticipado
  if (body.paymentMethod === "contraentrega" && body.state === "Vichada" && body.city === "Puerto Carreño") {
    return NextResponse.json({ error: "Pago contra entrega no disponible para Puerto Carreño" }, { status: 400 });
  }

  // Validate coupon and compute discount server-side — never trust client-sent amounts
  let discount = 0;
  if (body.couponCode) {
    const code = body.couponCode.trim().toUpperCase();
    const rate = COUPON_CODES[code];
    if (rate === undefined) {
      return NextResponse.json({ error: "Código de descuento inválido" }, { status: 400 });
    }
    discount = Math.round(body.subtotal * rate);
  } else if ((body.discount ?? 0) > 0) {
    // Discount without a coupon code is not allowed
    return NextResponse.json({ error: "Descuento sin código de cupón" }, { status: 400 });
  }

  // Validate totals server-side
  const expectedTotal = body.subtotal + body.shipping - discount;
  if (body.total <= 0) {
    return NextResponse.json({ error: "El total debe ser mayor a cero" }, { status: 400 });
  }
  if (Math.round(expectedTotal) !== Math.round(body.total)) {
    console.warn(`[Checkout] Total mismatch: expected ${expectedTotal}, got ${body.total}`);
    return NextResponse.json({ error: "Total inconsistente" }, { status: 400 });
  }
  if (discount > 0 && discount >= body.subtotal) {
    return NextResponse.json({ error: "El descuento no puede ser mayor o igual al subtotal" }, { status: 400 });
  }

  // ── 1. Insertar la orden (siempre, antes de cualquier redirect) ──────────
  const { data: order, error: insertError } = await supabase
    .from("orders")
    .insert({
      email: body.email,
      first_name: body.firstName,
      last_name: body.lastName,
      cedula: body.cedula ?? null,
      phone: body.phone,
      address: body.address,
      complement: body.complement ?? null,
      state: body.state,
      city: body.city,
      payment_method: body.paymentMethod,
      payment_status:
        body.paymentMethod === "contraentrega" ? "approved" : "pending",
      subtotal: body.subtotal,
      shipping: body.shipping,
      discount,
      coupon_code: body.couponCode ? body.couponCode.trim().toUpperCase() : null,
      total: body.total,
    })
    .select("id")
    .single();

  if (insertError || !order) {
    console.error("Supabase insert error:", insertError);
    return NextResponse.json(
      { error: "No se pudo registrar la orden" },
      { status: 500 }
    );
  }

  const orderId: string = order.id;

  // ── 2. Guardar los items de la orden ─────────────────────────────────────
  const { error: itemsError } = await supabase.from("order_items").insert(
    body.items.map((item) => ({
      order_id: orderId,
      product_id: item.id,
      name: item.name,
      variant: item.variant ?? null,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
      shopify_variant_id: item.shopifyVariantId ?? null,
    }))
  );

  if (itemsError) {
    // No bloqueamos — la orden ya existe, los items se pueden recuperar
    console.error("Supabase items insert error:", itemsError);
  }

  // ── 3. Contraentrega: solo guardar en Supabase, NO crear en Shopify aún ──
  // La orden se crea en Shopify desde /finalize, que se llama desde el
  // thank-you page cuando el usuario decide sobre el upsell del jabón
  // (acepta o descarta). Así llega completa a Shopify y a MasterShop.
  if (body.paymentMethod === "contraentrega") {
    // Conversions API: Purchase (contraentrega se considera conversión al registrar el pedido)
    sendPurchaseEvent({
      orderId,
      email: body.email,
      phone: body.phone,
      value: body.total,
      clientIp: req.headers.get("x-forwarded-for")?.split(",")[0] ?? undefined,
      clientUserAgent: req.headers.get("user-agent") ?? undefined,
      fbp: req.cookies.get("_fbp")?.value,
      fbc: req.cookies.get("_fbc")?.value,
    }).catch(() => {});

    return NextResponse.json({
      type: "contraentrega",
      status: "approved",
      order_id: orderId,
    });
  }

  // ── 4. Mercado Pago: crear preferencia con order_id en back_urls ─────────
  try {
    const preference = new Preference(client);

    const mpItems = body.items.map((item) => ({
      id: item.id,
      title: item.variant ? `${item.name} – ${item.variant}` : item.name,
      description: item.variant ? `${item.name} – ${item.variant}` : item.name,
      category_id: "health_and_beauty",
      quantity: item.quantity,
      unit_price: item.price,
      currency_id: "COP",
      picture_url: item.image,
    }));

    // Apply discount as a line item so MP totals match exactly
    if (body.couponCode && discount > 0) {
      mpItems.push({
        id: "discount",
        title: `Descuento ${body.couponCode.trim().toUpperCase()}`,
        description: `Descuento ${body.couponCode.trim().toUpperCase()}`,
        category_id: "health_and_beauty",
        quantity: 1,
        unit_price: -discount,
        currency_id: "COP",
        picture_url: "",
      });
    }

    const result = await preference.create({
      body: {
        items: mpItems,
        payer: {
          name: body.firstName,
          surname: body.lastName,
          email: body.email,
          // area_code is required by MP Colombia — without it payment validation fails
          phone: { area_code: "57", number: body.phone },
          address: {
            street_name: body.address,
          },
          ...(body.cedula
            ? { identification: { type: "CC", number: body.cedula } }
            : {}),
        },
        // El order_id viaja en la back_url para que MP lo devuelva en el redirect
        back_urls: {
          success: `${APP_URL}/checkout/thank-you?status=success&order_id=${orderId}`,
          failure: `${APP_URL}/checkout/thank-you?status=failure&order_id=${orderId}`,
          pending: `${APP_URL}/checkout/thank-you?status=pending&order_id=${orderId}`,
        },
        notification_url: `${APP_URL}/api/webhooks/mercadopago`,
        auto_return: "approved",
        statement_descriptor: "FEM SUPLEMENTOS",
        external_reference: orderId,
      },
    });

    // Actualizar la orden con el preference_id de MP
    await supabase
      .from("orders")
      .update({ mp_preference_id: result.id })
      .eq("id", orderId);

    return NextResponse.json({
      type: "mercadopago",
      init_point: result.init_point ?? result.sandbox_init_point,
      preference_id: result.id,
      order_id: orderId,
    });
  } catch (err) {
    console.error("MP checkout error:", err);

    // Marcar la orden como fallida para no dejarla huérfana en pending
    await supabase
      .from("orders")
      .update({ payment_status: "failure" })
      .eq("id", orderId);

    return NextResponse.json(
      { error: "Error creando la orden de pago" },
      { status: 500 }
    );
  }
}
