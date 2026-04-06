import CheckoutHeader from "@/components/checkout/CheckoutHeader";
import CheckoutForm from "@/components/checkout/CheckoutForm";
import OrderSummary from "@/components/checkout/OrderSummary";
import MobileOrderToggle from "@/components/checkout/MobileOrderToggle";
import { OrderItem } from "@/types/checkout";

// Demo product — replace with real data from Shopify/your API
const DEMO_ITEMS: OrderItem[] = [
  {
    id: "prod_001",
    name: "Proteína FEM Vainilla",
    variant: "900g · Sabor Vainilla",
    price: 110000,
    quantity: 1,
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=200&q=80",
  },
];

const SUBTOTAL = DEMO_ITEMS.reduce((acc, i) => acc + i.price * i.quantity, 0);
const SHIPPING = 15000;
const TOTAL = SUBTOTAL; // Free shipping = no shipping added

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
      <CheckoutHeader />

      {/* Mobile summary toggle */}
      <MobileOrderToggle
        items={DEMO_ITEMS}
        subtotal={SUBTOTAL}
        shipping={SHIPPING}
        total={TOTAL}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 items-start">
          {/* Left: Form */}
          <div>
            <CheckoutForm items={DEMO_ITEMS} total={TOTAL} />
          </div>

          {/* Right: Order summary (desktop only) */}
          <aside className="hidden lg:block sticky top-24">
            <OrderSummary
              items={DEMO_ITEMS}
              subtotal={SUBTOTAL}
              shipping={SHIPPING}
              total={TOTAL}
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
