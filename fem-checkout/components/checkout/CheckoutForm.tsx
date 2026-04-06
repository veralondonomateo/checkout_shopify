"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { OrderItem } from "@/types/checkout";
import ContactSection from "./ContactSection";
import DeliverySection from "./DeliverySection";
import ShippingSection from "./ShippingSection";
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
    .min(7, "Ingresa un teléfono válido")
    .regex(/^[\d\s\-\+\(\)]{7,15}$/, "Teléfono no válido"),
  paymentMethod: z
    .enum(["mercadopago", "contraentrega"] as const)
    .refine((v) => v !== undefined, { message: "Selecciona un método de pago" }),
  saveInfo: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface CheckoutFormProps {
  items: OrderItem[];
  total: number;
}

export default function CheckoutForm({ items, total }: CheckoutFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    try {
      // TODO: Connect to your backend / Shopify API
      console.log("Order data:", data);

      if (data.paymentMethod === "contraentrega") {
        // Create pending order
        await new Promise((r) => setTimeout(r, 1500)); // simulate API call
        setSubmitted(true);
      } else {
        // Redirect to Mercado Pago
        await new Promise((r) => setTimeout(r, 1500));
        // window.location.href = mercadoPagoUrl;
        setSubmitted(true);
      }
    } catch {
      console.error("Error processing order");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in-up space-y-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-2">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">¡Pedido recibido!</h2>
        <p className="text-gray-500 text-sm max-w-xs">
          Te enviaremos un SMS con el número de seguimiento de tu pedido.
        </p>
        <p className="text-xs text-gray-400">FEM – Hecho con amor en Colombia 🇨🇴</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <ContactSection register={register} errors={errors} />
      <DeliverySection register={register} errors={errors} watch={watch} setValue={setValue} />
      <ShippingSection />
      <PaymentSection register={register} errors={errors} watch={watch} />

      {/* Billing address toggle */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
        <h3 className="font-semibold text-gray-900 mb-3 text-sm">Dirección de facturación</h3>
        <div className="flex items-center gap-3 bg-[#fff8f8] rounded-xl border border-[#ffa69e]/20 p-4">
          <div className="w-5 h-5 rounded-full border-2 border-[#fc5245] bg-[#fc5245] flex items-center justify-center flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          <span className="text-sm text-gray-700">Usar la misma dirección de envío</span>
        </div>
      </section>

      {/* Submit CTA */}
      <div className="sticky bottom-0 pb-4 pt-2 bg-[#f7f4f4]">
        <Button
          type="submit"
          fullWidth
          loading={isSubmitting}
          className="text-base py-4 shadow-lg shadow-[#fc5245]/25"
        >
          {isSubmitting ? "Procesando..." : (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Completar pedido · {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(total)}
            </span>
          )}
        </Button>
        <p className="text-center text-xs text-gray-400 mt-2">
          🔒 Transacción 100% segura y encriptada
        </p>
      </div>
    </form>
  );
}
