import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { findProductBySku, findProductByTitle, addLineItemToShopifyOrder } from "@/lib/shopify";
import { VARIANT_IDS } from "@/lib/catalog";

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

  // El pedido ya trae jabón — suelto o dentro de un combo.
  //
  // La página de gracias ya no muestra la oferta en ese caso, pero esta es la
  // validación que manda: el navegador arma esa condición con lo que tiene en
  // sessionStorage, que puede venir de otra pestaña o de un pedido anterior.
  // Sin esta guarda la clienta acaba con dos jabones y descubriendo que el
  // segundo costaba diez mil menos.
  const { data: items } = await supabase
    .from("order_items")
    .select("name, shopify_variant_id")
    .eq("order_id", order_id);

  const yaLlevaJabon = (items ?? []).some(
    (i) =>
      i.shopify_variant_id === VARIANT_IDS.jabon || /jab[oó]n/i.test(i.name ?? "")
  );

  if (yaLlevaJabon) {
    console.log(`[Upsell] Orden ${order_id} ya lleva jabón — no se añade otro`);
    return NextResponse.json({ ok: true, already: true });
  }

  // Obtener shopify_variant_id y precio actual del jabón en Shopify (SKU 117700)
  // El combo "probiótico óvulos y jabón" puede compartir este SKU, así que
  // excluimos explícitamente productos que sean combos o contengan "óvulos".
  let shopifyVariantId: number | null = null;
  let shopifyVariantPrice: number | null = null;
  try {
    const bySkuResult = await findProductBySku("117700");
    const isCombo =
      bySkuResult !== null &&
      (/combo/i.test(bySkuResult.product.title) ||
        /[oó]vulos/i.test(bySkuResult.product.title));

    if (bySkuResult && !isCombo) {
      shopifyVariantId = bySkuResult.variant.id;
      shopifyVariantPrice = parseFloat(bySkuResult.variant.price) || null;
      console.log(`[Upsell] Jabón encontrado por SKU: ${bySkuResult.product.title} — precio Shopify: ${shopifyVariantPrice}`);
    } else {
      // El SKU apunta a un combo — buscar el jabón íntimo solo por nombre exacto
      const jabonByTitle = await findProductByTitle(/jab[oó]n\s*[ií]ntimo.*pH\s*neutro/i);
      if (jabonByTitle && !/combo/i.test(jabonByTitle.title)) {
        const variant =
          jabonByTitle.variants.find((v) => v.sku === "117700") ??
          jabonByTitle.variants[0];
        if (variant) {
          shopifyVariantId = variant.id;
          shopifyVariantPrice = parseFloat(variant.price) || null;
          console.log(`[Upsell] Jabón encontrado por título: ${jabonByTitle.title} — precio Shopify: ${shopifyVariantPrice}`);
        }
      }
    }
  } catch (err) {
    console.error("[Upsell] Error buscando jabón en Shopify:", err);
  }

  // Insertar item en Supabase
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

  // Actualizar total de la orden en Supabase
  const { error: rpcError } = await supabase.rpc("increment_order_total", {
    p_order_id: order_id,
    p_amount: JABON.price,
  });

  if (rpcError) {
    // Fallback manual
    const { data: ord } = await supabase
      .from("orders")
      .select("total")
      .eq("id", order_id)
      .single();
    if (ord) {
      await supabase
        .from("orders")
        .update({ total: ord.total + JABON.price })
        .eq("id", order_id);
    }
  }

  // Añadir como line item real en la orden de Shopify (Order Editing API)
  const { data: ord } = await supabase
    .from("orders")
    .select("shopify_order_id")
    .eq("id", order_id)
    .single();

  if (ord?.shopify_order_id) {
    try {
      await addLineItemToShopifyOrder(ord.shopify_order_id, {
        name: JABON.name,
        variant: JABON.variant,
        price: JABON.price,
        quantity: JABON.quantity,
        shopifyVariantId,
        shopifyVariantPrice,
      });
      console.log(`[Upsell] Line item añadido a Shopify orden #${ord.shopify_order_id}`);
    } catch (err) {
      // No bloqueamos — el item ya está en Supabase
      console.error("[Upsell] Error añadiendo line item a Shopify:", err);
    }
  }

  console.log(`[Upsell] Jabón añadido a orden ${order_id}`);
  return NextResponse.json({ ok: true });
}
