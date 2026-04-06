"use client";

import { useState, useMemo } from "react";
import { OrderItem } from "@/types/checkout";
import { UpsellProduct } from "./UpsellSection";
import CheckoutHeader from "./CheckoutHeader";
import CheckoutForm from "./CheckoutForm";
import OrderSummary from "./OrderSummary";
import MobileOrderToggle from "./MobileOrderToggle";
import ExitIntentPopup from "./ExitIntentPopup";

// ─── Demo main product ───────────────────────────────────────────────────────
const MAIN_ITEMS: OrderItem[] = [
  {
    id: "prod_001",
    name: "Proteína FEM Vainilla",
    variant: "900g · Sabor Vainilla",
    price: 110000,
    quantity: 1,
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=200&q=80",
  },
];

// ─── Upsell products ─────────────────────────────────────────────────────────
const UPSELL_PRODUCTS: UpsellProduct[] = [
  {
    id: "jabon-intimo-fem",
    name: "Jabón íntimo FEM",
    variant: "200 ml · pH neutro",
    price: 35000,
    image: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=200&q=80",
    benefit: "Higiene íntima con pH balanceado",
    stock: 7,
    soldToday: 14,
  },
  {
    id: "ovulos-fem",
    name: "Óvulos FEM",
    variant: "10 unidades · Probióticos",
    price: 45000,
    image: "https://images.unsplash.com/photo-1550572017-edd951b55104?w=200&q=80",
    benefit: "Restaura la flora vaginal naturalmente",
    stock: 5,
    soldToday: 9,
  },
];

const SHIPPING = 15000;

export default function CheckoutPageClient() {
  const [upsellQty, setUpsellQty] = useState<Record<string, number>>({});

  const handleToggle = (id: string) => {
    setUpsellQty((prev) => ({ ...prev, [id]: prev[id] ? 0 : 1 }));
  };

  const allItems = useMemo<OrderItem[]>(() => {
    const added = UPSELL_PRODUCTS.filter((p) => (upsellQty[p.id] ?? 0) > 0).map((p) => ({
      id: p.id,
      name: p.name,
      variant: p.variant,
      price: p.price,
      quantity: upsellQty[p.id],
      image: p.image,
    }));
    return [...MAIN_ITEMS, ...added];
  }, [upsellQty]);

  const subtotal = useMemo(
    () => allItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [allItems]
  );
  const total = subtotal; // envío gratis

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
      <CheckoutHeader />

      <MobileOrderToggle
        items={allItems}
        subtotal={subtotal}
        shipping={SHIPPING}
        total={total}
      />

      <ExitIntentPopup />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 items-start">
          {/* Left: Form */}
          <CheckoutForm
            allItems={allItems}
            total={total}
            upsellProducts={UPSELL_PRODUCTS}
            upsellQty={upsellQty}
            onUpsellToggle={handleToggle}
          />

          {/* Right: Summary (desktop) */}
          <aside className="hidden lg:block sticky top-24">
            <OrderSummary
              items={allItems}
              subtotal={subtotal}
              shipping={SHIPPING}
              total={total}
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
