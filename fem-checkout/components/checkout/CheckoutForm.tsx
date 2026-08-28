"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { OrderItem } from "@/types/checkout";
import { UpsellProduct } from "./UpsellSection";
import ContactSection from "./ContactSection";
import DeliverySection from "./DeliverySection";
import ShippingSection from "./ShippingSection";
import UpsellSection from "./UpsellSection";
import PaymentSection from "./PaymentSection";
import Button from "@/components/ui/Button";
import { trackStartedCheckout } from "@/lib/klaviyo";
import { useSeguimientoCarrito } from "./useSeguimientoCarrito";
import { asegurarIdsMeta } from "@/lib/meta-tracking";

const schema = z.object({
  // Require a valid email — phone numbers break Mercado Pago's payer.email
  email: z
    .string()
    .min(1, "Este campo es obligatorio")
    .transform((v) => v.trim())
    .refine(
      // No dot right before the @ (e.g. "ana.@mail.com") — Shopify rejects this as invalid
      // even though it looks fine to a naive regex.
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !v.includes(".@"),
      "Ingresa un email válido"
    ),
  firstName: z.string().min(2, "Ingresa tu nombre").regex(/^[a-zA-ZáéíóúüÁÉÍÓÚÜ\s\-']+$/, "Solo letras, sin ñ ni caracteres especiales"),
  lastName: z.string().min(2, "Ingresa tu apellido").regex(/^[a-zA-ZáéíóúüÁÉÍÓÚÜ\s\-']+$/, "Solo letras, sin ñ ni caracteres especiales"),
  cedula: z.string().regex(/^\d*$/, "Solo se permiten números").optional(),
  address: z.string().min(5, "Ingresa una dirección válida"),
  complement: z.string().optional(),
  state: z.string().min(1, "Selecciona un departamento"),
  city: z.string().min(1, "Selecciona una ciudad"),
  // Strip spaces/dashes before validating — users often type "300 123 4567"
  phone: z
    .string()
    .refine(
      (v) => /^\d{10}$/.test(v.replace(/\D/g, "")),
      "Ingresa los 10 dígitos de tu celular (sin código de país)"
    )
    .transform((v) => v.replace(/\D/g, "")),
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

  // `isSubmitting` es estado: React lo aplica en el siguiente render, así que
  // dos toques muy seguidos alcanzan a disparar dos POST. El ref bloquea de
  // forma síncrona, en el mismo tick.
  const inFlight = useRef(false);

  // Hasta que React hidrata, el onSubmit todavía no está enganchado: un toque
  // en el botón enviaba el <form> de forma nativa, que recarga la página con
  // los datos del cliente en la query string y sin crear ningún pedido.
  // Mantener el botón inhabilitado ese instante evita perder esa venta (y que
  // el email, el teléfono y la dirección queden escritos en la URL).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Clave de idempotencia: se mantiene igual mientras el pedido sea el mismo,
  // de modo que un reintento (o un doble envío) reutilice la orden ya creada
  // en vez de generar una nueva. Cambia si el cliente modifica el carrito.
  //
  // Vive en sessionStorage, no en memoria: si solo estuviera en un ref, una
  // recarga o un "volver atrás" desde la página de gracias generaría una clave
  // nueva y el mismo pedido entraría dos veces (visto en producción, dos envíos
  // idénticos con 4 minutos de diferencia).
  const IDEMPOTENCY_STORAGE_KEY = "fem-idempotency";
  // Pasada esta ventana, un pedido idéntico se considera una compra nueva y
  // legítima en vez de un reenvío del mismo.
  const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;

  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const getIdempotencyKey = (signature: string): string => {
    if (idempotencyRef.current?.signature === signature) {
      return idempotencyRef.current.key;
    }

    // Recuperamos la clave de un intento anterior de esta misma sesión.
    try {
      const raw = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { signature: string; key: string; ts: number };
        if (saved.signature === signature && Date.now() - saved.ts < IDEMPOTENCY_TTL_MS) {
          idempotencyRef.current = { signature, key: saved.key };
          return saved.key;
        }
      }
    } catch {
      /* sessionStorage no disponible — seguimos con una clave nueva */
    }

    const key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    idempotencyRef.current = { signature, key };
    try {
      sessionStorage.setItem(
        IDEMPOTENCY_STORAGE_KEY,
        JSON.stringify({ signature, key, ts: Date.now() })
      );
    } catch {
      /* ignore */
    }
    return key;
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      saveInfo: true,
      paymentMethod: "mercadopago",
    },
  });

  // Recuperación de carritos: guarda lo que se va llenando para poder escribir
  // por WhatsApp a quien se va sin comprar. Es un camino lateral — no toca el
  // envío del pedido ni puede bloquearlo.
  const sessionIdRef = useSeguimientoCarrito({
    watch: watch as never,
    items: allItems,
    subtotal,
    total,
    coupon,
  });

  // Link "termina tu compra" del mensaje de recuperación: `?r=<token>` trae
  // los datos que la clienta ya había escrito para que no los repita.
  //
  // Se lee de `window.location` y no con useSearchParams a propósito: así este
  // efecto no obliga al formulario a entrar en Suspense ni cambia el render
  // del servidor. Si algo falla, el checkout queda en blanco como siempre.
  useEffect(() => {
    let cancelado = false;
    const token = new URLSearchParams(window.location.search).get("r");
    if (!token) return;

    fetch(`/api/checkout/recuperar?t=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((datos) => {
        if (cancelado || !datos?.ok) return;
        // Campo por campo y no con `reset`: los inputs no son controlados, y
        // `setValue` es el único que además escribe el valor en el DOM.
        for (const [campo, valor] of Object.entries(datos.cliente)) {
          if (typeof valor === "string" && valor) {
            setValue(campo as keyof FormData, valor, { shouldValidate: false });
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelado = true;
    };
  }, [setValue]);


  // Fire Klaviyo "Started Checkout" as soon as a valid email is entered (on blur),
  // capturing shoppers who abandon before paying. identify re-runs on correction;
  // the track itself fires only once per cart/session (guarded inside the helper).
  const handleEmailBlur = (email: string) => {
    const trimmed = email.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !trimmed.includes(".@");
    if (!valid) return;
    trackStartedCheckout({
      email: trimmed,
      firstName: watch("firstName"),
      lastName: watch("lastName"),
      phone: watch("phone"),
      items: allItems,
      total,
    });
  };

  const onSubmit = async (data: FormData) => {
    if (inFlight.current) return;
    inFlight.current = true;

    setIsSubmitting(true);
    setSubmitError("");

    // El pedido se identifica por su contenido + comprador: mismo pedido →
    // misma clave → el servidor reutiliza la orden en vez de duplicarla.
    const signature = JSON.stringify({
      email: data.email.trim().toLowerCase(),
      phone: data.phone,
      items: allItems.map((i) => [i.id, i.quantity, i.price]),
      total,
      paymentMethod: data.paymentMethod,
    });

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
          idempotencyKey: getIdempotencyKey(signature),
          // Cierra la sesión de seguimiento: quien compra deja de ser un
          // carrito abandonado en el mismo momento en que envía el pedido.
          sessionId: sessionIdRef.current || undefined,
          // Atribución de Meta. El `fbclid` va por si el pixel todavía no
          // alcanzó a crear la cookie `_fbc`: sin él, una compra rápida desde
          // un anuncio se queda sin atribuir.
          eventSourceUrl: window.location.href,
          fbclid: new URLSearchParams(window.location.search).get("fbclid") ?? undefined,
          // Van también en el cuerpo, no solo como cookie: si el navegador
          // bloquea cookies de terceros o el pixel no las creó, esto es lo
          // único que le llega al servidor.
          ...asegurarIdsMeta(),
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
        // Lo manda el servidor; solo llega en contraentrega.
        destino: result.destino ?? null,
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
      // Solo se libera el bloqueo cuando hubo error: en el camino feliz la
      // página se está redirigiendo y el botón debe seguir inhabilitado.
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <ContactSection register={register} errors={errors} onEmailBlur={handleEmailBlur} />
      <DeliverySection register={register} errors={errors} watch={watch} setValue={setValue} />
      <ShippingSection />

      {/* Upsells */}
      <UpsellSection
        products={upsellProducts}
        qty={upsellQty}
        onToggle={onUpsellToggle}
      />

      <PaymentSection register={register} errors={errors} watch={watch} control={control} setValue={setValue} />

      {/* Coupon — mobile only */}
      <div className="lg:hidden">
        <section className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Código de descuento</p>
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
              className="px-4 py-2.5 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      </div>

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
          disabled={!hydrated}
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
