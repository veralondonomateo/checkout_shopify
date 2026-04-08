import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createShopifyOrder } from "@/lib/shopify";

type DBPaymentStatus = "pending" | "approved" | "failure" | "in_process";

function mapMPStatus(mpStatus: string): DBPaymentStatus {
  switch (mpStatus) {
    case "approved":
      return "approved";
    case "rejected":
    case "cancelled":
      return "failure";
    case "in_process":
    case "authorized":
      return "in_process";
    default:
      return "pending";
  }
}

// Fallback del redirect de MP — verifica el estado real del pago en la API de MP
// (no confiamos en el ?status= de la URL que puede ser manipulado)
export async function POST(req: NextRequest) {
  let body: { order_id: string; payment_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { order_id, payment_id } = body;

  if (!order_id || !payment_id) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }

  // Consultar el estado real en MP — nunca confiar en el status del query param
  let status: DBPaymentStatus = "pending";
  try {
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${payment_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (mpRes.ok) {
      const payment = await mpRes.json();
      status = mapMPStatus(payment.status);
    } else {
      console.warn("[Confirm] MP API no disponible, usando status de redirect como fallback");
      // Si MP no responde, dejamos la orden en pending para que el webhook la actualice
      return NextResponse.json({ ok: true, verified: false });
    }
  } catch (err) {
    console.error("[Confirm] Error consultando MP:", err);
    return NextResponse.json({ ok: true, verified: false });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: status,
      mp_payment_id: payment_id,
    })
    .eq("id", order_id)
    .eq("payment_method", "mercadopago");

  if (error) {
    console.error("[Confirm] Error actualizando orden:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // Crear orden en Shopify si el pago fue aprobado
  if (status === "approved") {
    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (order && !order.shopify_order_id) {
      const { data: items } = await supabase
        .from("order_items")
        .select("name, variant, price, quantity")
        .eq("order_id", order_id);

      try {
        const shopifyId = await createShopifyOrder({
          email: order.email,
          firstName: order.first_name,
          lastName: order.last_name,
          phone: order.phone,
          address: order.address,
          complement: order.complement,
          city: order.city,
          state: order.state,
          items: items ?? [],
          shipping: order.shipping ?? 0,
          total: order.total,
          paymentMethod: "mercadopago",
          mpPaymentId: payment_id,
          femOrderId: order_id,
        });
        await supabase
          .from("orders")
          .update({ shopify_order_id: shopifyId })
          .eq("id", order_id);
      } catch (err) {
        console.error("[Confirm] Error creando orden Shopify:", err);
      }
    }
  }

  return NextResponse.json({ ok: true, verified: true, status });
}
