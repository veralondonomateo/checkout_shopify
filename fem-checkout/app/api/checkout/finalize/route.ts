import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createShopifyOrder } from "@/lib/shopify";
import { sendAlert } from "@/lib/alert";

// Crea la orden en Shopify para pedidos contraentrega, llamado desde el
// thank-you page tras la ventana de upsell (90 s o al cerrar la pestaña).
export async function POST(req: NextRequest) {
  let body: { order_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { order_id } = body;
  if (!order_id) {
    return NextResponse.json({ error: "Falta order_id" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", order_id)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  }

  // Idempotencia: ya tiene orden en Shopify
  if (order.shopify_order_id) {
    return NextResponse.json({ ok: true, shopify_order_id: order.shopify_order_id });
  }

  // Solo para órdenes aprobadas contraentrega
  if (order.payment_status !== "approved" || order.payment_method !== "contraentrega") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Pre-claim: previene que dos llamadas concurrentes ambas creen una orden en Shopify.
  // Usa el valor actual de shopify_error como condición CAS (compare-and-swap atómico).
  if (order.shopify_error === "PROCESSING") {
    console.log(`[Finalize] Orden ${order_id} ya siendo procesada por otra llamada — saliendo`);
    return NextResponse.json({ ok: true, already_processing: true });
  }

  let preclaimOk = false;
  if (order.shopify_error === null) {
    const { data: pc } = await supabase
      .from("orders")
      .update({ shopify_error: "PROCESSING" })
      .eq("id", order_id)
      .is("shopify_order_id", null)
      .is("shopify_error", null)
      .select("id")
      .maybeSingle();
    preclaimOk = !!pc;
  } else {
    const { data: pc } = await supabase
      .from("orders")
      .update({ shopify_error: "PROCESSING" })
      .eq("id", order_id)
      .is("shopify_order_id", null)
      .eq("shopify_error", order.shopify_error)
      .select("id")
      .maybeSingle();
    preclaimOk = !!pc;
  }

  if (!preclaimOk) {
    console.log(`[Finalize] Perdida la carrera por orden ${order_id} — otra llamada ya la tomó`);
    return NextResponse.json({ ok: true, lost_claim: true });
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("name, variant, price, quantity, shopify_variant_id")
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
      items: (items ?? []).map((i) => ({
        name: i.name,
        variant: i.variant,
        price: i.price,
        quantity: i.quantity,
        shopifyVariantId: i.shopify_variant_id ?? undefined,
      })),
      shipping: order.shipping ?? 0,
      total: order.total,
      paymentMethod: "contraentrega",
      femOrderId: order_id,
    });

    // Atomic claim: only update if no other process beat us (race-condition guard)
    const { data: claimed } = await supabase
      .from("orders")
      .update({ shopify_order_id: shopifyId, shopify_error: null })
      .eq("id", order_id)
      .is("shopify_order_id", null)
      .select("id")
      .maybeSingle();

    if (!claimed) {
      const alertMsg = `[Finalize] DUPLICADO: Shopify orden ${shopifyId} creada para orden ${order_id} que ya estaba sincronizada. Revisar y anular la orden duplicada en Shopify.`;
      console.error(alertMsg);
      sendAlert(alertMsg).catch(() => {});
    }

    console.log(`[Finalize] Orden Shopify #${shopifyId} creada para ${order_id}`);
    return NextResponse.json({ ok: true, shopify_order_id: shopifyId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Finalize] Error creando orden Shopify:", msg);
    await supabase.from("orders").update({ shopify_error: msg }).eq("id", order_id);
    return NextResponse.json({ error: "Error Shopify", detail: msg }, { status: 500 });
  }
}
