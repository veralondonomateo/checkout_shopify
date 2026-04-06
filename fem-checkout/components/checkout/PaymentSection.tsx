"use client";

import { UseFormRegister, FieldErrors, UseFormWatch } from "react-hook-form";
import { CheckoutFormData } from "@/types/checkout";

interface PaymentSectionProps {
  register: UseFormRegister<CheckoutFormData>;
  errors: FieldErrors<CheckoutFormData>;
  watch: UseFormWatch<CheckoutFormData>;
}

export default function PaymentSection({ register, errors, watch }: PaymentSectionProps) {
  const selectedMethod = watch("paymentMethod");

  const methods = [
    {
      id: "mercadopago" as const,
      label: "Mercado Pago",
      sublabel: "Serás redirigido para completar tu compra de forma segura",
      icon: (
        <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none">
          <circle cx="24" cy="24" r="24" fill="#00B1EA" />
          <path d="M8 25.5c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <circle cx="24" cy="25.5" r="4" fill="white" />
        </svg>
      ),
      badge: "Popular",
      extraInfo: (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {[
            { label: "Nequi", color: "bg-purple-50 text-purple-700" },
            { label: "Daviplata", color: "bg-red-50 text-red-700" },
            { label: "PSE", color: "bg-blue-50 text-blue-700" },
            { label: "Bancolombia", color: "bg-yellow-50 text-yellow-800" },
            { label: "Débito / Crédito", color: "bg-gray-100 text-gray-600" },
          ].map(({ label, color }) => (
            <span key={label} className={`text-[10px] font-medium px-2 py-0.5 rounded ${color}`}>
              {label}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "contraentrega" as const,
      label: "Pago contra entrega",
      sublabel: "Pagas en efectivo cuando recibas tu pedido",
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      badge: null,
      extraInfo: null,
    },
  ];

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5 sm:p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-6 h-6 rounded-full bg-[#fc5245] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">4</span>
        </div>
        <h2 className="font-semibold text-gray-900">Método de pago</h2>
      </div>

      {errors.paymentMethod && (
        <p className="text-xs text-red-500 mb-3 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Selecciona un método de pago
        </p>
      )}

      <div className="space-y-2.5">
        {methods.map((method) => {
          const isSelected = selectedMethod === method.id;
          return (
            <label
              key={method.id}
              className={`
                relative flex items-start gap-4 p-4 rounded-md border cursor-pointer
                transition-colors duration-150
                ${isSelected
                  ? "border-[#fc5245] bg-white"
                  : "border-gray-200 bg-white hover:border-gray-300"
                }
              `}
            >
              <input
                type="radio"
                value={method.id}
                className="sr-only"
                {...register("paymentMethod")}
              />

              {/* Custom radio */}
              <div className="flex-shrink-0 mt-0.5">
                <div className={`
                  w-4 h-4 rounded-full border-2 flex items-center justify-center
                  transition-colors duration-150
                  ${isSelected ? "border-[#fc5245]" : "border-gray-300"}
                `}>
                  {isSelected && (
                    <div className="w-2 h-2 rounded-full bg-[#fc5245]" />
                  )}
                </div>
              </div>

              {/* Icon */}
              <div className={`
                flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center
                ${isSelected ? "bg-gray-50" : "bg-gray-50"}
              `}>
                <span className={isSelected ? "text-gray-700" : "text-gray-400"}>
                  {method.icon}
                </span>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-gray-900">
                    {method.label}
                  </span>
                  {method.badge && (
                    <span className="text-[10px] font-semibold text-[#fc5245] bg-[#fc5245]/10 px-1.5 py-0.5 rounded">
                      {method.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 text-gray-500 leading-relaxed">
                  {method.sublabel}
                </p>
                {isSelected && method.extraInfo}
              </div>
            </label>
          );
        })}
      </div>

      {/* Security note */}
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-400 border-t border-gray-100 pt-4">
        <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        Tus datos están protegidos con encriptación SSL de 256 bits
      </div>
    </section>
  );
}
