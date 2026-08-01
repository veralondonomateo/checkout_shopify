import { Suspense } from "react";
import CheckoutPageClient from "@/components/checkout/CheckoutPageClient";
import CheckoutHeader from "@/components/checkout/CheckoutHeader";
import { getProducts, getProductByHandle, getProductByHandleFresh, ShopifyProduct } from "@/lib/shopify";
import { CheckoutProduct } from "@/types/checkout";
import { VARIANT_IDS } from "@/lib/catalog";

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

/**
 * Pantalla para un link que apunta a un producto que ya no existe.
 *
 * A propósito no vende el producto principal en su lugar: sustituir en
 * silencio genera pedidos de algo que el cliente nunca pidió, y ese descuadre
 * lo termina pagando la operación logística. Ofrecemos el catálogo para que
 * la decisión sea del cliente.
 */
function ProductoNoDisponible() {
  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
      <CheckoutHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0l-7.1 12.25A2 2 0 005 19z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">
            Este producto ya no está disponible
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            El enlace que abriste corresponde a un producto que ya no tenemos en
            venta. Puedes continuar con nuestro producto principal.
          </p>
          <a
            href="/checkout"
            className="inline-block w-full bg-gray-900 text-white text-sm font-medium rounded-md py-3 hover:bg-gray-800 transition-colors"
          >
            Ver producto disponible
          </a>
        </div>
      </main>
    </div>
  );
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

  // Qué hacer cuando no hay producto resuelto depende de por qué no lo hay:
  //
  // - Sin `?product=`: es el link genérico. Mostramos el producto principal,
  //   resuelto por ID de variante para que el pedido quede enlazado (antes
  //   caía a un item hardcodeado sin variante y entraba a Shopify suelto).
  // - Con `?product=` que no existe en el catálogo: NO lo reemplazamos por
  //   otro producto. Despachar algo distinto a lo anunciado rompe la logística
  //   y deja al cliente con un pedido que no pidió. Mejor decir la verdad.
  // - Con `?product=` pero el catálogo vino vacío: Shopify no respondió. No
  //   podemos distinguir "no existe" de "no pude preguntar", así que caemos al
  //   principal en vez de tumbar todas las ventas durante una caída.
  const catalogoDisponible = allProducts.length > 0;
  let resolvedVariantId = initialVariantId;
  let handleInexistente: string | null = null;

  if (!shopifyProduct) {
    if (product && catalogoDisponible) {
      // Antes de declarar que no existe, preguntamos sin caché: puede ser un
      // producto recién creado que el catálogo cacheado todavía no ve.
      shopifyProduct = await getProductByHandleFresh(product).catch(() => null);
    }
  }

  if (!shopifyProduct) {
    if (product && catalogoDisponible) {
      handleInexistente = product;
      // Queda en los logs de Vercel, que es donde sí se puede consultar.
      console.error(
        `[LINK-ROTO] El producto "${product}" no existe en Shopify — el checkout mostró "no disponible"`
      );
    } else {
      if (product) {
        console.error(`[Checkout] Catálogo vacío (Shopify no respondió) — cayendo al principal para "${product}"`);
      }
      shopifyProduct = findByVariantId(VARIANT_IDS.principal);
      if (shopifyProduct) resolvedVariantId = VARIANT_IDS.principal;
    }
  }

  if (handleInexistente) {
    return <ProductoNoDisponible />;
  }

  function findByTitle(pattern: RegExp): ShopifyProduct | null {
    return allProducts.find((p) => pattern.test(p.title)) ?? null;
  }

  /** Busca por ID de variante — inmune a renombres y a SKUs compartidos. */
  function findByVariantId(variantId: number): ShopifyProduct | null {
    return allProducts.find((p) => p.variants.some((v) => v.id === variantId)) ?? null;
  }

  // SKU 117700 = Jabón íntimo, 117701 = Óvulos, 117705 = Gomitas PMS
  const gomitasProduct =
    allProducts.find((p) => p.variants.some((v) => v.sku === "117705")) ??
    allProducts.find((p) => p.handle === "gomitas-sindrome-premestrual-x60") ??
    findByTitle(/gomitas.*preme[ns]?trual/i) ??
    findByTitle(/gomitas.*sindrome/i);

  // El ID de variante va primero: el SKU 117700 lo comparte el combo
  // "probiótico + óvulos + jabón", así que buscar por SKU puede devolver el
  // combo y cobrar/descontar el producto equivocado.
  const jabonProduct =
    findByVariantId(VARIANT_IDS.jabon) ??
    allProducts.find((p) => p.variants.some((v) => v.sku === "117700")) ??
    allProducts.find((p) => p.handle === "jabon-intimo-fem") ??
    allProducts.find((p) => p.handle.includes("jabon") && p.handle.includes("intimo")) ??
    findByTitle(/jab[oó]n\s*[ií]ntimo/i);

  const ovulosProduct =
    findByVariantId(VARIANT_IDS.ovulos) ??
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
        initialVariantId={resolvedVariantId}
        initialQty={initialQty}
      />
    </Suspense>
  );
}
