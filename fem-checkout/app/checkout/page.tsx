import { Suspense } from "react";
import CheckoutPageClient from "@/components/checkout/CheckoutPageClient";
import { getProducts, getProductByHandle, ShopifyProduct } from "@/lib/shopify";
import { CheckoutProduct } from "@/types/checkout";

/** Reduce el producto a lo que el cliente realmente renderiza. */
function toCheckoutProduct(p: ShopifyProduct | null): CheckoutProduct | null {
  if (!p) return null;
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    variants: p.variants.map((v) => ({ id: v.id, title: v.title, price: v.price })),
    images: p.images.slice(0, 1).map((i) => ({ src: i.src })),
  };
}

export const metadata = {
  title: "FEM | Finalizar compra",
  description: "Checkout seguro - FEM Suplementos",
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; variant?: string; qty?: string }>;
}) {
  const { product, variant, qty } = await searchParams;
  const initialVariantId = variant ? parseInt(variant, 10) || undefined : undefined;
  const initialQty = qty ? Math.max(1, parseInt(qty, 10) || 1) : undefined;

  // Fetch all active products once, then match by handle/title — avoids
  // multiple round-trips and handles when exact handles differ from constants.
  const allProducts = await getProducts().catch(() => [] as ShopifyProduct[]);

  // El producto principal casi siempre está en el catálogo que ya trajimos;
  // solo caemos a una segunda llamada si el handle no aparece ahí.
  let shopifyProduct: ShopifyProduct | null = null;
  if (product) {
    shopifyProduct =
      allProducts.find((p) => p.handle === product) ??
      allProducts.find((p) => p.handle.includes(product.replace(/-/g, ""))) ??
      null;

    if (!shopifyProduct) {
      shopifyProduct = await getProductByHandle(product).catch((err) => {
        console.error("[Checkout] Error fetching main product:", err);
        return null;
      });
    }
  }

  function findByTitle(pattern: RegExp): ShopifyProduct | null {
    return allProducts.find((p) => pattern.test(p.title)) ?? null;
  }

  // SKU 117700 = Jabón íntimo, 117701 = Óvulos, 117705 = Gomitas PMS
  const gomitasProduct =
    allProducts.find((p) => p.variants.some((v) => v.sku === "117705")) ??
    allProducts.find((p) => p.handle === "gomitas-sindrome-premestrual-x60") ??
    findByTitle(/gomitas.*preme[ns]?trual/i) ??
    findByTitle(/gomitas.*sindrome/i);

  const jabonProduct =
    allProducts.find((p) => p.variants.some((v) => v.sku === "117700")) ??
    allProducts.find((p) => p.handle === "jabon-intimo-fem") ??
    allProducts.find((p) => p.handle.includes("jabon") && p.handle.includes("intimo")) ??
    findByTitle(/jab[oó]n\s*[ií]ntimo/i);

  const ovulosProduct =
    allProducts.find((p) => p.variants.some((v) => v.sku === "117701")) ??
    findByTitle(/[oó]vulos\s*vaginales\s*fem\s*x\s*6/i) ??
    findByTitle(/[oó]vulos\s*vaginales/i) ??
    allProducts.find(
      (p) =>
        /[oó]vulos/i.test(p.title) &&
        !/jab[oó]n/i.test(p.title) &&
        !/combo/i.test(p.title)
    );

  return (
    <Suspense>
      <CheckoutPageClient
        shopifyProduct={toCheckoutProduct(shopifyProduct)}
        gomitasProduct={toCheckoutProduct(gomitasProduct ?? null)}
        jabonProduct={toCheckoutProduct(jabonProduct ?? null)}
        ovulosProduct={toCheckoutProduct(ovulosProduct ?? null)}
        initialVariantId={initialVariantId}
        initialQty={initialQty}
      />
    </Suspense>
  );
}
