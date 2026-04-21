import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

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

  // La orden en Shopify la crea exclusivamente el webhook de MP
  // (/api/webhooks/mercadopago) para evitar duplicados por condición de carrera.
  // El cron actúa como red de seguridad si el webhook falla.

  return NextResponse.json({ ok: true, verified: true, status });
}
