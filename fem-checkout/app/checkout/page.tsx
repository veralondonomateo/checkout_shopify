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
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;

  let shopifyProduct: ShopifyProduct | null = null;
  if (product) {
    try {
      shopifyProduct = await getProductByHandle(product);
    } catch (err) {
      console.error("[Checkout] Error fetching Shopify product:", err);
    }
  }

  return (
    <Suspense>
      <CheckoutPageClient shopifyProduct={shopifyProduct} />
    </Suspense>
  );
}
