import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createShopifyOrder } from "@/lib/shopify";
import { sendAlert } from "@/lib/alert";

/**
 * Safety-net cron: finds every approved order (contraentrega + paid MP)
 * that never made it to Shopify and creates it now.
 *
 * Runs every 10 minutes via vercel.json cron config.
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */
export async function GET(req: NextRequest) {
  // Auth: Vercel sends the secret as a Bearer token
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();

  // Orders approved >10 min ago with no Shopify order yet
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: orphans, error } = await supabase
    .from("orders")
    .select("id, email, first_name, last_name, phone, address, complement, city, state, shipping, total, payment_method, shopify_error")
    .eq("payment_status", "approved")
    .is("shopify_order_id", null)
    .not("shopify_error", "ilike", "PERMANENT:%")
    .lt("created_at", cutoff);

  if (error) {
    console.error("[Cron] Supabase query error:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!orphans || orphans.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  console.log(`[Cron] Found ${orphans.length} orphaned order(s)`);

  const results: Array<{ id: string; status: "ok" | "error"; detail?: string }> = [];

  for (const order of orphans) {
    // Re-check inside loop in case a concurrent finalize just ran
    const { data: fresh } = await supabase
      .from("orders")
      .select("shopify_order_id")
      .eq("id", order.id)
      .single();

    if (fresh?.shopify_order_id) {
      results.push({ id: order.id, status: "ok", detail: "already_synced" });
      continue;
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("name, variant, price, quantity, shopify_variant_id")
      .eq("order_id", order.id);

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
        paymentMethod: order.payment_method,
        femOrderId: order.id,
      });

      // Atomic claim: only update if no other process beat us (race-condition guard)
      const { data: claimed } = await supabase
        .from("orders")
        .update({ shopify_order_id: shopifyId, shopify_error: null })
        .eq("id", order.id)
        .is("shopify_order_id", null)
        .select("id")
        .maybeSingle();

      if (!claimed) {
        const alertMsg = `[Cron] DUPLICADO: Shopify orden ${shopifyId} creada para orden ${order.id} que ya estaba sincronizada. Revisar y anular la orden duplicada en Shopify.`;
        console.error(alertMsg);
        sendAlert(alertMsg).catch(() => {});
        results.push({ id: order.id, status: "ok", detail: "already_synced_race" });
        continue;
      }

      console.log(`[Cron] Recovered order ${order.id} → Shopify #${shopifyId}`);
      results.push({ id: order.id, status: "ok", detail: String(shopifyId) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron] Failed to recover order ${order.id}:`, msg);
      // 422 = Shopify validation error (bad data) → permanent failure, don't retry
      const isPermanent = msg.includes("Shopify API 422");
      const storedError = isPermanent ? `PERMANENT: ${msg}` : msg;
      await supabase.from("orders").update({ shopify_error: storedError }).eq("id", order.id);
      results.push({ id: order.id, status: isPermanent ? "ok" : "error", detail: isPermanent ? "permanent_data_error" : msg });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;
  const rescued = results.filter((r) => r.status === "ok" && !["already_synced", "already_synced_race"].includes(r.detail ?? ""));

  // Alert on every rescue — means a webhook failed silently
  if (rescued.length > 0) {
    const ids = rescued.map((r) => r.id).join(", ");
    sendAlert(`[Cron] Rescató ${rescued.length} orden(es) huérfana(s) (webhook fallido): ${ids}`).catch(() => {});
  }

  if (failed > 0) {
    const failedIds = results.filter((r) => r.status === "error").map((r) => `${r.id}: ${r.detail}`).join(" | ");
    sendAlert(`[Cron] ${failed} orden(es) fallaron al sincronizar con Shopify: ${failedIds}`).catch(() => {});
  }

  return NextResponse.json({ ok: true, processed: orphans.length, synced: ok, failed, results });
}
