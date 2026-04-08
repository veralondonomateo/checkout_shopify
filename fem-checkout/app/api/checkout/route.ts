import { NextRequest, NextResponse } from "next/server";
import MercadoPagoConfig, { Preference } from "mercadopago";
import { OrderItem } from "@/types/checkout";
import { createServerClient } from "@/lib/supabase";
import { createShopifyOrder } from "@/lib/shopify";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

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
      discount: body.discount ?? 0,
      coupon_code: body.couponCode ?? null,
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
    }))
  );

  if (itemsError) {
    // No bloqueamos — la orden ya existe, los items se pueden recuperar
    console.error("Supabase items insert error:", itemsError);
  }

  // ── 3. Contraentrega: crear orden en Shopify y responder ────────────────
  if (body.paymentMethod === "contraentrega") {
    try {
      const shopifyId = await createShopifyOrder({
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        address: body.address,
        complement: body.complement,
        city: body.city,
        state: body.state,
        items: body.items.map((i) => ({
          name: i.name,
          variant: i.variant,
          price: i.price,
          quantity: i.quantity,
        })),
        shipping: body.shipping,
        total: body.total,
        paymentMethod: "contraentrega",
        femOrderId: orderId,
      });
      await supabase
        .from("orders")
        .update({ shopify_order_id: shopifyId })
        .eq("id", orderId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Checkout] Error creando orden Shopify:", msg);
      await supabase.from("orders").update({ shopify_error: msg }).eq("id", orderId);
    }

    return NextResponse.json({
      type: "contraentrega",
      status: "approved",
      order_id: orderId,
    });
  }

  // ── 4. Mercado Pago: crear preferencia con order_id en back_urls ─────────
  try {
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: body.items.map((item) => ({
          id: item.id,
          title: item.variant ? `${item.name} – ${item.variant}` : item.name,
          description: item.variant ? `${item.name} – ${item.variant}` : item.name,
          category_id: "health_and_beauty",
          quantity: item.quantity,
          unit_price: item.price,
          currency_id: "COP",
          picture_url: item.image,
        })),
        payer: {
          name: body.firstName,
          surname: body.lastName,
          email: body.email,
          phone: { number: body.phone },
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
        auto_return: "approved",
        statement_descriptor: "FEM SUPLEMENTOS",
        external_reference: orderId,
        ...(body.couponCode && body.discount && body.discount > 0
          ? {
              discounts: [
                {
                  name: body.couponCode,
                  amount: body.discount,
                },
              ],
            }
          : {}),
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
