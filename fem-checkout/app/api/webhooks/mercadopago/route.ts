import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { createShopifyOrder } from "@/lib/shopify";
import { sendPurchaseEvent } from "@/lib/meta";
import { mapMPStatus } from "@/lib/mp";
import { sendAlert } from "@/lib/alert";
import { claimOrderForShopify, isProcessingActive } from "@/lib/order-sync";

const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos

// Validar la firma x-Signature que envía MP y que el timestamp sea reciente
function isValidSignature(
  secret: string,
  dataId: string,
  requestId: string,
  ts: string,
  v1: string
): boolean {
  // Rechazar webhooks con timestamp mayor a 5 minutos (protección anti-replay)
  const tsMs = parseInt(ts, 10) * 1000;
  if (isNaN(tsMs) || Date.now() - tsMs > WEBHOOK_MAX_AGE_MS) {
    return false;
  }
  // Plantilla firmada según docs de MP:
  // "id:{dataId};request-id:{requestId};ts:{ts};"
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return expected === v1;
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    // Parsear x-Signature: "ts=1704908010,v1=618c853..."
    const xSignature = req.headers.get("x-signature") ?? "";
    const ts = xSignature.match(/ts=([^,]+)/)?.[1] ?? "";
    const v1 = xSignature.match(/v1=([^,]+)/)?.[1] ?? "";
    const requestId = req.headers.get("x-request-id") ?? "";

    // MP envía el id del recurso también como query param "data.id"
    const { searchParams } = new URL(req.url);
    const dataId = searchParams.get("data.id") ?? "";

    // Validar firma si hay secret configurado (en producción siempre debe estar)
    if (webhookSecret) {
      if (!ts || !v1 || !dataId) {
        return NextResponse.json({ error: "Firma incompleta" }, { status: 400 });
      }
      if (!isValidSignature(webhookSecret, dataId, requestId, ts, v1)) {
        console.warn("[MP Webhook] Firma inválida — posible request no autorizado");
        return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
      }
    }

    const body = await req.json();

    // Solo procesar eventos de pago
    if (body.type !== "payment") {
      return NextResponse.json({ ok: true, skipped: body.type });
    }

    const paymentId = String(body.data?.id ?? dataId);
    if (!paymentId) {
      return NextResponse.json({ ok: true });
    }

    // Consultar el estado real del pago en MP (no confiar solo en el webhook)
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!mpRes.ok) {
      console.error("[MP Webhook] Error consultando pago:", await mpRes.text());
      // Devolver 200 para que MP no reintente indefinidamente
      return NextResponse.json({ ok: false, reason: "mp_api_error" });
    }

    const payment = await mpRes.json();
    const orderId: string | undefined = payment.external_reference;

    if (!orderId) {
      console.warn("[MP Webhook] Pago sin external_reference:", paymentId);
      return NextResponse.json({ ok: true });
    }

    const status = mapMPStatus(payment.status);

    const supabase = createServerClient();
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: status,
        mp_payment_id: paymentId,
      })
      .eq("id", orderId)
      .eq("payment_method", "mercadopago");

    if (error) {
      console.error("[MP Webhook] Error actualizando orden:", error);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    // Conversions API: Purchase cuando MP confirma el pago
    if (status === "approved") {
      // Los datos de atribución se guardaron al crear el pedido: aquí no hay
      // cookies ni IP de la clienta, porque quien llama es el servidor de
      // Mercado Pago. Sin recuperarlos, la mitad de las ventas llegaba a Meta
      // solo con email y teléfono.
      // Idempotencia: Mercado Pago reintenta sus webhooks. `capi_sent_at` se
      // reclama de forma atómica —solo gana quien lo encuentre en null— así que
      // dos entregas del mismo aviso no mandan dos compras a Meta.
      const { data: reclamado } = await supabase
        .from("orders")
        .update({ capi_sent_at: new Date().toISOString() })
        .eq("id", orderId)
        .is("capi_sent_at", null)
        .select("id")
        .maybeSingle();

      const { data: orderForMeta } = reclamado
        ? await supabase
            .from("orders")
            .select(
              "email, phone, total, first_name, last_name, city, state, fbp, fbc, client_ip, client_user_agent, event_source_url"
            )
            .eq("id", orderId)
            .single()
        : { data: null };

      if (!reclamado) {
        console.log(`[MP Webhook] Purchase de ${orderId} ya se envió a Meta — omitido`);
      }

      if (orderForMeta) {
        const { data: lineas } = await supabase
          .from("order_items")
          .select("product_id, quantity, price, shopify_variant_id")
          .eq("order_id", orderId);

        sendPurchaseEvent({
          orderId,
          contents: (lineas ?? []).map((l) => ({
            id: String(l.shopify_variant_id ?? l.product_id),
            quantity: l.quantity,
            price: Number(l.price),
          })),
          email: orderForMeta.email,
          phone: orderForMeta.phone,
          value: orderForMeta.total,
          firstName: orderForMeta.first_name ?? undefined,
          lastName: orderForMeta.last_name ?? undefined,
          city: orderForMeta.city ?? undefined,
          state: orderForMeta.state ?? undefined,
          fbp: orderForMeta.fbp ?? undefined,
          fbc: orderForMeta.fbc ?? undefined,
          clientIp: orderForMeta.client_ip ?? undefined,
          clientUserAgent: orderForMeta.client_user_agent ?? undefined,
          eventSourceUrl: orderForMeta.event_source_url ?? undefined,
        }).catch(() => {});
      }
    }

    // Crear orden en Shopify cuando el pago es aprobado
    if (status === "approved") {
      const { data: order } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      if (order && !order.shopify_order_id) {
        // Pre-claim: previene que dos procesos concurrentes creen ambos una
        // orden en Shopify. Mismo protocolo que finalize y el cron.
        if (isProcessingActive(order.shopify_error)) {
          console.log(`[MP Webhook] Orden ${orderId} ya siendo procesada — saliendo`);
          return NextResponse.json({ ok: true });
        }

        const preclaimOk = await claimOrderForShopify(supabase, orderId, order.shopify_error);

        if (!preclaimOk) {
          console.log(`[MP Webhook] Perdida la carrera por orden ${orderId} — otro proceso ya la tomó`);
          return NextResponse.json({ ok: true });
        }

        const { data: items } = await supabase
          .from("order_items")
          .select("name, variant, price, quantity, shopify_variant_id")
          .eq("order_id", orderId);

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
            items: (items ?? []).map((i) => ({
              name: i.name,
              variant: i.variant,
              price: i.price,
              quantity: i.quantity,
              shopifyVariantId: i.shopify_variant_id ?? undefined,
            })),
            shipping: order.shipping ?? 0,
            total: order.total,
            paymentMethod: "mercadopago",
            mpPaymentId: paymentId,
            femOrderId: orderId,
            couponCode: order.coupon_code ?? null,
            discount: order.discount ? parseFloat(order.discount) : null,
          });

          // Atomic update: only claim the row if no other process beat us to it
          const { data: claimed } = await supabase
            .from("orders")
            .update({ shopify_order_id: shopifyId, shopify_error: null })
            .eq("id", orderId)
            .is("shopify_order_id", null)
            .select("id")
            .maybeSingle();

          if (!claimed) {
            const alertMsg = `[MP Webhook] DUPLICADO: Shopify orden ${shopifyId} creada para orden ${orderId} que ya estaba sincronizada. Revisar y anular la orden duplicada en Shopify.`;
            console.error(alertMsg);
            sendAlert(alertMsg).catch(() => {});
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[MP Webhook] Error creando orden Shopify:", msg);
          await supabase.from("orders").update({ shopify_error: msg }).eq("id", orderId);
        }
      }
    }

    console.log(`[MP Webhook] Orden ${orderId} → ${status} (pago ${paymentId})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[MP Webhook] Error inesperado:", err);
    // 200 para evitar reintentos de MP en errores nuestros
    return NextResponse.json({ ok: false, reason: "internal_error" });
  }
}
