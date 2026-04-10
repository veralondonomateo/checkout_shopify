"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { OrderItem } from "@/types/checkout";
import { UpsellProduct } from "./UpsellSection";
import ContactSection from "./ContactSection";
import DeliverySection from "./DeliverySection";
import ShippingSection from "./ShippingSection";
import UpsellSection from "./UpsellSection";
import PaymentSection from "./PaymentSection";
import Button from "@/components/ui/Button";

const schema = z.object({
  email: z
    .string()
    .min(1, "Este campo es obligatorio")
    .refine(
      (v) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ||
        /^(\+57)?[\s-]?3\d{9}$/.test(v.replace(/\s/g, "")),
      "Ingresa un email o teléfono válido"
    ),
  firstName: z.string().min(2, "Ingresa tu nombre"),
  lastName: z.string().min(2, "Ingresa tu apellido"),
  cedula: z.string().optional(),
  address: z.string().min(5, "Ingresa una dirección válida"),
  complement: z.string().optional(),
  state: z.string().min(1, "Selecciona un departamento"),
  city: z.string().min(1, "Selecciona una ciudad"),
  phone: z
    .string()
    .regex(/^\d{10}$/, "Número inválido"),
  paymentMethod: z
    .enum(["mercadopago", "contraentrega"] as const)
    .refine((v) => v !== undefined, { message: "Selecciona un método de pago" }),
  saveInfo: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface CheckoutFormProps {
  allItems: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  upsellProducts: UpsellProduct[];
  upsellQty: Record<string, number>;
  onUpsellToggle: (id: string) => void;
  coupon: string;
  couponApplied: boolean;
  couponError: string;
  discount: number;
  onCouponChange: (value: string) => void;
  onCouponApply: () => void;
}

export default function CheckoutForm({
  allItems,
  subtotal,
  shipping,
  total,
  upsellProducts,
  upsellQty,
  onUpsellToggle,
  coupon,
  couponApplied,
  couponError,
  discount,
  onCouponChange,
  onCouponApply,
}: CheckoutFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      saveInfo: true,
      paymentMethod: "mercadopago",
    },
  });

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          items: allItems,
          subtotal,
          shipping,
          total,
          couponCode: coupon || undefined,
          discount: discount || undefined,
        }),
      });

      if (!res.ok) throw new Error("Error del servidor");

      const result = await res.json();

      // Guardar datos de la orden para la página de gracias (display)
      sessionStorage.setItem("fem-order", JSON.stringify({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        items: allItems,
        total,
        paymentMethod: data.paymentMethod,
      }));

      if (result.type === "contraentrega") {
        window.location.href = `/checkout/thank-you?status=success&method=contraentrega&order_id=${result.order_id}`;
      } else if (result.init_point) {
        window.location.href = result.init_point;
      } else {
        throw new Error("No se recibió URL de pago");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setSubmitError("Ocurrió un error al procesar tu pedido. Por favor intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <ContactSection register={register} errors={errors} />
      <DeliverySection register={register} errors={errors} watch={watch} setValue={setValue} />
      <ShippingSection />

      {/* Upsells */}
      <UpsellSection
        products={upsellProducts}
        qty={upsellQty}
        onToggle={onUpsellToggle}
      />

      <PaymentSection register={register} errors={errors} watch={watch} />

      {/* Coupon — mobile only (desktop shows in OrderSummary sidebar) */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 lg:hidden">
        <p className="text-sm font-semibold text-gray-900 mb-3">Código de descuento</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={coupon}
            onChange={(e) => onCouponChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCouponApply()}
            placeholder="Ej: FEM10"
            className={`flex-1 px-3.5 py-2.5 rounded-md border text-sm bg-white placeholder-gray-400 text-gray-900
              focus:outline-none focus:ring-1 focus:ring-[#fc5245]/20 focus:border-[#fc5245] transition-colors
              ${couponError ? "border-red-300" : couponApplied ? "border-green-400 bg-green-50" : "border-gray-300"}`}
            disabled={couponApplied}
          />
          <button
            type="button"
            onClick={onCouponApply}
            disabled={couponApplied || !coupon.trim()}
            className="px-4 py-2.5 rounded-md border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {couponApplied ? "✓" : "Aplicar"}
          </button>
        </div>
        {couponError && <p className="text-xs text-red-500 mt-1.5">{couponError}</p>}
        {couponApplied && discount > 0 && (
          <p className="text-xs text-green-600 mt-1.5 font-medium">
            Descuento aplicado: -{new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(discount)}
          </p>
        )}
      </section>

      {/* Billing address */}
      <section className="bg-white rounded-lg border border-gray-200 p-5 sm:p-6">
        <h3 className="font-semibold text-gray-900 mb-3 text-sm">Dirección de facturación</h3>
        <div className="flex items-center gap-3 bg-gray-50 rounded-md border border-gray-200 p-3.5">
          <div className="w-4 h-4 rounded-full border-2 border-[#fc5245] flex items-center justify-center flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-[#fc5245]" />
          </div>
          <span className="text-sm text-gray-700">Usar la misma dirección de envío</span>
        </div>
      </section>

      {/* Submit CTA */}
      <div className="sticky bottom-0 pb-4 pt-2 bg-[#f5f5f5]">
        {submitError && (
          <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-red-700">{submitError}</p>
          </div>
        )}
        <Button
          type="submit"
          fullWidth
          loading={isSubmitting}
          className="text-base py-4"
        >
          {isSubmitting ? "Procesando..." : (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="sm:hidden">
                Pagar ·{" "}
                {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(total)}
              </span>
              <span className="hidden sm:inline">
                Completar pedido ·{" "}
                {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(total)}
              </span>
            </span>
          )}
        </Button>
        <p className="text-center text-xs text-gray-500 mt-2 flex items-center justify-center gap-1">
          <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Transacción 100% segura y encriptada
        </p>
      </div>
    </form>
  );
}
