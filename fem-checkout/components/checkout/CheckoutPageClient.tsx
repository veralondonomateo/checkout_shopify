"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { OrderItem, CheckoutProduct } from "@/types/checkout";
import { UpsellProduct } from "./UpsellSection";
import CheckoutHeader from "./CheckoutHeader";
import CheckoutForm from "./CheckoutForm";
import OrderSummary from "./OrderSummary";
import MobileOrderToggle from "./MobileOrderToggle";
import { trackMeta, trackTikTok } from "@/lib/pixels";
import { COUPON_CODES } from "@/lib/coupons";
import { VARIANT_IDS, PRINCIPAL_FALLBACK_PRICE } from "@/lib/catalog";

// Último recurso: solo se usa si Shopify no respondió y el servidor no pudo
// resolver el producto principal. Lleva shopifyVariantId para que, incluso en
// ese caso, el pedido quede enlazado al producto real y descuente inventario.
// El nombre y la variante replican los de Shopify a propósito.
const DEFAULT_ITEM: OrderItem = {
  id: "prod_001",
  name: "Alimento con probióticos y prebióticos x 60 UND",
  variant: "Compra Única 1 / 1 unidad",
  price: PRINCIPAL_FALLBACK_PRICE,
  quantity: 1,
  image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=200&q=80",
  shopifyVariantId: VARIANT_IDS.principal,
};

function shopifyProductToItem(p: CheckoutProduct, variantId?: number): OrderItem {
  const variant = variantId
    ? (p.variants.find((v) => v.id === variantId) ?? p.variants[0])
    : p.variants[0];
  return {
    id: String(p.id),
    name: p.title,
    variant: variant?.title !== "Default Title" ? variant?.title : undefined,
    price: Math.round(parseFloat(variant?.price ?? "0")),
    quantity: 1,
    image: p.images[0]?.src ?? "",
    shopifyVariantId: variant?.id,
  };
}

// Catálogo base de upsells — Gomitas se completa desde Shopify.
// Cada uno trae su shopifyVariantId de respaldo: si la consulta a Shopify
// falla, el upsell sigue enlazado al producto real en vez de entrar como
// línea suelta sin inventario.
const BASE_UPSELLS: UpsellProduct[] = [
  {
    id: "jabon-intimo-fem",
    name: "Jabón íntimo pH neutro",
    variant: "200 ml",
    price: 29900,
    image: "https://cdn.shopify.com/s/files/1/0611/6999/1768/files/Jabon-intimo-fem.webp?v=1772573021",
    benefit: "Higiene íntima con pH balanceado",
    stock: 7,
    soldToday: 14,
    shopifyHandle: "jabon-intimo-ph-neutro",
    shopifyVariantId: VARIANT_IDS.jabon,
  },
  {
    id: "ovulos-fem",
    name: "Óvulos FEM",
    variant: "6 unidades · Probióticos",
    price: 45000,
    image: "https://cdn.shopify.com/s/files/1/0611/6999/1768/files/Ovulos.jpg?v=1755895009",
    benefit: "Restaura la flora vaginal naturalmente",
    stock: 5,
    soldToday: 9,
    shopifyHandle: "ovulos-vaginales-fem",
    shopifyVariantId: VARIANT_IDS.ovulos,
  },
  {
    id: "gomitas-pms",
    name: "Gomitas PMS FEM",
    variant: "x60 gomitas · Síndrome premenstrual",
    price: 0, // filled from Shopify
    image: "",  // filled from Shopify
    benefit: "Elimina tus síntomas menstruales",
    stock: 8,
    soldToday: 11,
    shopifyHandle: "gomitas-sindrome-premestrual-x60",
    shopifyVariantId: VARIANT_IDS.gomitas,
  },
];

const SHIPPING = 15000;

// Los códigos vienen de lib/coupons, el mismo módulo que valida el servidor.

interface CheckoutPageClientProps {
  shopifyProduct?: CheckoutProduct | null;
  gomitasProduct?: CheckoutProduct | null;
  jabonProduct?: CheckoutProduct | null;
  ovulosProduct?: CheckoutProduct | null;
  initialVariantId?: number;
  initialQty?: number;
}

export default function CheckoutPageClient({ shopifyProduct, gomitasProduct, jabonProduct, ovulosProduct, initialVariantId, initialQty }: CheckoutPageClientProps) {
  const searchParams = useSearchParams();
  const MAIN_ITEMS: OrderItem[] = shopifyProduct
    ? [shopifyProductToItem(shopifyProduct, initialVariantId)]
    : [DEFAULT_ITEM];
  const mainVariantId = MAIN_ITEMS[0]?.shopifyVariantId;
  const mpStatus = searchParams.get("status"); // "success" | "failure" | "pending" | null

  const [mainQty, setMainQty] = useState(initialQty ?? 1);
  const [upsellQty, setUpsellQty] = useState<Record<string, number>>({});

  // Disparar InitiateCheckout al cargar la página. Los pixeles ahora cargan
  // diferidos, así que esperamos a que existan en vez de descartar el evento.
  useEffect(() => {
    const cancelMeta = trackMeta("InitiateCheckout");
    const cancelTikTok = trackTikTok("InitiateCheckout");
    return () => {
      cancelMeta();
      cancelTikTok();
    };
  }, []);

  // ── Coupon state (shared between form and order summary) ──────────────────
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState("");

  const handleApplyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    if (COUPON_CODES[code] !== undefined) {
      setCouponApplied(true);
      setCouponError("");
    } else {
      setCouponError("Código no válido");
    }
  };

  const handleCouponChange = (value: string) => {
    setCoupon(value);
    setCouponError("");
  };

  // ── Upsell catalog: fill data from Shopify + filter main product ─────────
  const UPSELL_PRODUCTS = useMemo<UpsellProduct[]>(() => {
    const filled = BASE_UPSELLS.map((p) => {
      // `?? p.shopifyVariantId` conserva el respaldo: un producto de Shopify
      // sin variantes no debe borrar el enlace que ya traíamos.
      if (p.id === "gomitas-pms" && gomitasProduct) {
        const v = gomitasProduct.variants[0];
        return {
          ...p,
          price: Math.round(parseFloat(v?.price ?? "0")),
          image: gomitasProduct.images[0]?.src ?? p.image,
          shopifyVariantId: v?.id ?? p.shopifyVariantId,
        };
      }
      if (p.id === "jabon-intimo-fem" && jabonProduct) {
        return { ...p, shopifyVariantId: jabonProduct.variants[0]?.id ?? p.shopifyVariantId };
      }
      if (p.id === "ovulos-fem" && ovulosProduct) {
        return { ...p, shopifyVariantId: ovulosProduct.variants[0]?.id ?? p.shopifyVariantId };
      }
      return p;
    });
    // No ofrecer como upsell lo que la clienta ya está comprando.
    //
    // Antes esto se comparaba solo por handle, y los handles escritos a mano
    // aquí no coincidían con los reales de Shopify ("jabon-intimo-fem" vs
    // "jabon-intimo-ph-neutro"): el filtro nunca se activaba y el mismo
    // producto se podía comprar dos veces en un mismo pedido, a dos precios
    // distintos. Ahora manda el ID de variante, que es el dato que Shopify
    // realmente usa; el handle queda como respaldo.
    return filled.filter((p) => {
      if (mainVariantId && p.shopifyVariantId === mainVariantId) return false;
      if (p.shopifyHandle === shopifyProduct?.handle) return false;
      if (p.id === "gomitas-pms" && (!p.price || !p.image)) return false;
      return true;
    });
  }, [gomitasProduct, jabonProduct, ovulosProduct, shopifyProduct, mainVariantId]);

  // ── Items & totals ────────────────────────────────────────────────────────
  const handleToggle = (id: string) =>
    setUpsellQty((prev) => ({ ...prev, [id]: prev[id] ? 0 : 1 }));

  const allItems = useMemo<OrderItem[]>(() => {
    const mainWithQty = MAIN_ITEMS.map((item, i) =>
      i === 0 ? { ...item, quantity: mainQty } : item
    );
    const added = UPSELL_PRODUCTS.filter((p) => (upsellQty[p.id] ?? 0) > 0).map((p) => ({
      id: p.id,
      name: p.name,
      variant: p.variant,
      price: p.price,
      quantity: upsellQty[p.id],
      image: p.image,
      shopifyVariantId: p.shopifyVariantId,
    }));
    return [...mainWithQty, ...added];
  }, [upsellQty, mainQty, UPSELL_PRODUCTS]);

  const subtotal = useMemo(
    () => allItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [allItems]
  );

  const discountRate = couponApplied
    ? (COUPON_CODES[coupon.trim().toUpperCase()] ?? 0)
    : 0;
  const discount = Math.round(subtotal * discountRate);
  const total = subtotal - discount;

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
      <CheckoutHeader />

      {mpStatus === "success" && (
        <div className="max-w-6xl mx-auto px-4 mt-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="font-semibold text-green-800 text-sm">¡Pago aprobado!</p>
              <p className="text-green-700 text-xs mt-0.5">Tu pedido fue confirmado. Recibirás un mensaje con el seguimiento.</p>
            </div>
          </div>
        </div>
      )}

      {mpStatus === "pending" && (
        <div className="max-w-6xl mx-auto px-4 mt-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-semibold text-yellow-800 text-sm">Pago pendiente</p>
              <p className="text-yellow-700 text-xs mt-0.5">Tu pago está siendo procesado. Te notificaremos cuando se confirme.</p>
            </div>
          </div>
        </div>
      )}

      {mpStatus === "failure" && (
        <div className="max-w-6xl mx-auto px-4 mt-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <div>
              <p className="font-semibold text-red-800 text-sm">Pago rechazado</p>
              <p className="text-red-700 text-xs mt-0.5">No se pudo procesar tu pago. Intenta de nuevo o elige otro método.</p>
            </div>
          </div>
        </div>
      )}

      <MobileOrderToggle
        items={allItems}
        subtotal={subtotal}
        shipping={SHIPPING}
        total={total}
        mainQty={mainQty}
        onMainQtyChange={setMainQty}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 items-start">
          <CheckoutForm
            allItems={allItems}
            subtotal={subtotal}
            shipping={0}
            total={total}
            upsellProducts={UPSELL_PRODUCTS}
            upsellQty={upsellQty}
            onUpsellToggle={handleToggle}
            coupon={coupon}
            couponApplied={couponApplied}
            couponError={couponError}
            onCouponChange={handleCouponChange}
            onCouponApply={handleApplyCoupon}
            discount={discount}
          />

          <aside className="hidden lg:block sticky top-24">
            <OrderSummary
              items={allItems}
              subtotal={subtotal}
              shipping={SHIPPING}
              total={total}
              coupon={coupon}
              couponApplied={couponApplied}
              couponError={couponError}
              discount={discount}
              onCouponChange={handleCouponChange}
              onCouponApply={handleApplyCoupon}
              mainQty={mainQty}
              onMainQtyChange={setMainQty}
            />
          </aside>
        </div>
      </main>

      <footer className="py-6 text-center border-t border-gray-100 bg-white">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400 flex-wrap">
          <span>© 2025 FEM · Todos los derechos reservados</span>
          <span className="hidden sm:inline">·</span>
          <a href="#" className="hover:text-[#fc5245] transition-colors">Política de privacidad</a>
          <span className="hidden sm:inline">·</span>
          <a href="#" className="hover:text-[#fc5245] transition-colors">Términos y condiciones</a>
        </div>
      </footer>
    </div>
  );
}
