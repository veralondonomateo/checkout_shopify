import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { findProductByTitle, addNoteToShopifyOrder } from "@/lib/shopify";

const JABON = {
  product_id: "jabon-intimo-prebioticos",
  name: "Jabón íntimo pH neutro",
  variant: "200 ml",
  price: 19900,
  quantity: 1,
  image:
    "https://cdn.shopify.com/s/files/1/0611/6999/1768/files/Probiotico-jabon-5.jpg?v=1769877892",
};

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

  // Idempotencia: no añadir dos veces
  const { data: existing } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", order_id)
    .eq("product_id", JABON.product_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, already: true });
  }

  // Obtener variant_id de Shopify buscando por título (no depende del handle exacto)
  let shopifyVariantId: number | null = null;
  try {
    const jabonShopify = await findProductByTitle(/jab[oó]n.{0,10}[ií]ntimo/i);
    shopifyVariantId = jabonShopify?.variants[0]?.id ?? null;
    if (jabonShopify) {
      console.log(`[Upsell] Jabón encontrado: ${jabonShopify.title} (handle: ${jabonShopify.handle})`);
    }
  } catch (err) {
    console.error("[Upsell] Error buscando jabón en Shopify:", err);
  }

  // Insertar item
  const { error: insertError } = await supabase.from("order_items").insert({
    order_id,
    product_id: JABON.product_id,
    name: JABON.name,
    variant: JABON.variant,
    price: JABON.price,
    quantity: JABON.quantity,
    image: JABON.image,
    shopify_variant_id: shopifyVariantId,
  });

  if (insertError) {
    console.error("[Upsell] Error insertando item:", insertError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // Actualizar total de la orden
  const { error: updateError } = await supabase.rpc("increment_order_total", {
    p_order_id: order_id,
    p_amount: JABON.price,
  });

  if (updateError) {
    // Fallback manual si el RPC no existe
    const { data: order } = await supabase
      .from("orders")
      .select("total, shopify_order_id")
      .eq("id", order_id)
      .single();

    if (order) {
      await supabase
        .from("orders")
        .update({ total: order.total + JABON.price })
        .eq("id", order_id);

      // Añadir nota a la orden de Shopify si ya existe
      if (order.shopify_order_id) {
        try {
          await addNoteToShopifyOrder(
            order.shopify_order_id,
            `UPSELL AÑADIDO: ${JABON.name} x${JABON.quantity} — $${JABON.price.toLocaleString("es-CO")} COP`
          );
          console.log(`[Upsell] Nota añadida a Shopify orden #${order.shopify_order_id}`);
        } catch (err) {
          console.error("[Upsell] Error añadiendo nota a Shopify:", err);
        }
      }
    }
  } else {
    // Si el RPC funcionó, también buscamos la orden para añadir la nota
    const { data: order } = await supabase
      .from("orders")
      .select("shopify_order_id")
      .eq("id", order_id)
      .single();

    if (order?.shopify_order_id) {
      try {
        await addNoteToShopifyOrder(
          order.shopify_order_id,
          `UPSELL AÑADIDO: ${JABON.name} x${JABON.quantity} — $${JABON.price.toLocaleString("es-CO")} COP`
        );
        console.log(`[Upsell] Nota añadida a Shopify orden #${order.shopify_order_id}`);
      } catch (err) {
        console.error("[Upsell] Error añadiendo nota a Shopify:", err);
      }
    }
  }

  console.log(`[Upsell] Jabón añadido a orden ${order_id}`);
  return NextResponse.json({ ok: true });
}
