"use client";

import { UseFormRegister, FieldErrors } from "react-hook-form";
import { CheckoutFormData } from "@/types/checkout";
import Input from "@/components/ui/Input";

interface ContactSectionProps {
  register: UseFormRegister<CheckoutFormData>;
  errors: FieldErrors<CheckoutFormData>;
}

export default function ContactSection({ register, errors }: ContactSectionProps) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 animate-fade-in-up">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ffa69e] to-[#fc5245] flex items-center justify-center shadow-sm">
          <span className="text-white text-xs font-bold">1</span>
        </div>
        <h2 className="font-semibold text-gray-900">Contacto</h2>
      </div>

      <div className="space-y-4">
        <Input
          label="Email o Teléfono"
          type="text"
          placeholder="tu@email.com o 300 123 4567"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
          error={errors.email?.message}
          {...register("email")}
        />

        <label className="flex items-center gap-2.5 cursor-pointer select-none group">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only peer"
              {...register("saveInfo")}
            />
            <div className="w-5 h-5 rounded-md border-2 border-gray-200 peer-checked:border-[#ffa69e] peer-checked:bg-[#ffa69e] transition-all flex items-center justify-center group-hover:border-[#ffa69e]">
              <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <span className="text-sm text-gray-600">Recibir novedades y ofertas por correo</span>
        </label>
      </div>
    </section>
  );
}
