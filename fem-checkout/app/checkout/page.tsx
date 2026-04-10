import { Suspense } from "react";
import CheckoutPageClient from "@/components/checkout/CheckoutPageClient";
import { getProducts, getProductByHandle, ShopifyProduct } from "@/lib/shopify";

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
  const [allProducts, shopifyProduct] = await Promise.all([
    getProducts().catch(() => [] as ShopifyProduct[]),
    product
      ? getProductByHandle(product).catch((err) => {
          console.error("[Checkout] Error fetching main product:", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  function findByTitle(pattern: RegExp): ShopifyProduct | null {
    return allProducts.find((p) => pattern.test(p.title)) ?? null;
  }

  // Exact Shopify titles: "Gomitas Sindrome Premestrual x 60 UND",
  //   "Jabón íntimo pH neutro x 200 ml", "Óvulos vaginales Fem x 6 UND"
  const gomitasProduct =
    allProducts.find((p) => p.handle === "gomitas-sindrome-premestrual-x60") ??
    findByTitle(/gomitas.*preme[ns]?trual/i) ??
    findByTitle(/gomitas.*sindrome/i);

  const jabonProduct =
    allProducts.find((p) => p.handle === "jabon-intimo-fem") ??
    allProducts.find((p) => p.handle.includes("jabon") && p.handle.includes("intimo")) ??
    findByTitle(/jab[oó]n\s*[ií]ntimo/i);

  const ovulosProduct =
    allProducts.find((p) => p.handle === "ovulos-fem") ??
    allProducts.find((p) => p.handle.includes("ovulo")) ??
    findByTitle(/[oó]vulos\s*vaginales/i) ??
    findByTitle(/[oó]vulos/i);

  return (
    <Suspense>
      <CheckoutPageClient
        shopifyProduct={shopifyProduct}
        gomitasProduct={gomitasProduct ?? null}
        jabonProduct={jabonProduct ?? null}
        ovulosProduct={ovulosProduct ?? null}
        initialVariantId={initialVariantId}
        initialQty={initialQty}
      />
    </Suspense>
  );
}
