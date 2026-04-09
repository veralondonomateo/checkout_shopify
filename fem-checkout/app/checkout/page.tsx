import { Suspense } from "react";
import CheckoutPageClient from "@/components/checkout/CheckoutPageClient";
import { getProductByHandle, ShopifyProduct } from "@/lib/shopify";

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

  const [shopifyProduct, gomitasProduct, jabonProduct, ovulosProduct] = await Promise.all([
    product
      ? getProductByHandle(product).catch((err) => {
          console.error("[Checkout] Error fetching main product:", err);
          return null;
        })
      : Promise.resolve(null),
    getProductByHandle("gomitas-sindrome-premestrual-x60").catch(() => null),
    getProductByHandle("jabon-intimo-fem").catch(() => null),
    getProductByHandle("ovulos-fem").catch(() => null),
  ]);

  return (
    <Suspense>
      <CheckoutPageClient
        shopifyProduct={shopifyProduct}
        gomitasProduct={gomitasProduct}
        jabonProduct={jabonProduct}
        ovulosProduct={ovulosProduct}
        initialVariantId={initialVariantId}
        initialQty={initialQty}
      />
    </Suspense>
  );
}
