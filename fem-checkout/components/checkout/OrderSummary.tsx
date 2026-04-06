"use client";

import { useState } from "react";
import Image from "next/image";
import { OrderItem } from "@/types/checkout";

interface OrderSummaryProps {
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OrderSummary({ items, subtotal, shipping, total }: OrderSummaryProps) {
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState("");

  const handleApplyCoupon = () => {
    if (!coupon.trim()) return;
    // Demo logic — connect to your backend
    if (coupon.toUpperCase() === "FEM10") {
      setCouponApplied(true);
      setCouponError("");
    } else {
      setCouponError("Código no válido");
    }
  };

  return (
    <div className="bg-[#fff8f8] rounded-2xl border border-[#ffa69e]/20 p-5 sm:p-6 space-y-5">
      {/* Items */}
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3.5">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white border border-[#ffa69e]/20 shadow-sm">
                <Image
                  src={item.image}
                  alt={item.name}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="absolute -top-2 -right-2 bg-[#fc5245] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                {item.quantity}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm leading-tight truncate">{item.name}</p>
              {item.variant && (
                <p className="text-xs text-gray-500 mt-0.5">{item.variant}</p>
              )}
            </div>
            <p className="font-semibold text-gray-900 text-sm flex-shrink-0">
              {formatCOP(item.price * item.quantity)}
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-[#ffa69e]/20" />

      {/* Coupon */}
      <div>
        <div className="flex gap-2">
          <input
            type="text"
            value={coupon}
            onChange={(e) => { setCoupon(e.target.value); setCouponError(""); }}
            placeholder="Código de descuento"
            className={`
              flex-1 px-3.5 py-2.5 rounded-xl border text-sm bg-white
              placeholder-gray-400 text-gray-900
              focus:outline-none focus:ring-2 focus:ring-[#ffa69e]/25 focus:border-[#ffa69e]
              transition-all duration-200
              ${couponError ? "border-red-300" : "border-gray-200"}
              ${couponApplied ? "border-green-300 bg-green-50" : ""}
            `}
            disabled={couponApplied}
          />
          <button
            onClick={handleApplyCoupon}
            disabled={couponApplied || !coupon.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#ffa69e]/20 text-[#fc5245] text-sm font-semibold hover:bg-[#ffa69e]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {couponApplied ? "✓" : "Aplicar"}
          </button>
        </div>
        {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
        {couponApplied && <p className="text-xs text-green-600 mt-1 font-medium">🎉 Código aplicado: -10%</p>}
      </div>

      <div className="border-t border-[#ffa69e]/20" />

      {/* Totals */}
      <div className="space-y-2.5">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span className="font-medium text-gray-900">{formatCOP(subtotal)}</span>
        </div>

        <div className="flex justify-between text-sm text-gray-600">
          <span>Envío</span>
          <div className="flex items-center gap-2">
            <span className="line-through text-gray-400">{formatCOP(shipping)}</span>
            <span className="text-green-600 font-semibold text-xs bg-green-50 px-2 py-0.5 rounded-full">
              GRATIS
            </span>
          </div>
        </div>

        {couponApplied && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Descuento (10%)</span>
            <span className="font-medium">-{formatCOP(subtotal * 0.1)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-[#ffa69e]/20" />

      {/* Total */}
      <div className="flex justify-between items-center">
        <span className="font-semibold text-gray-900">Total</span>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-0.5">COP</p>
          <p className="text-2xl font-bold text-[#fc5245]">
            {formatCOP(couponApplied ? total - subtotal * 0.1 : total)}
          </p>
        </div>
      </div>

      {/* Trust badges */}
      <div className="border-t border-[#ffa69e]/20 pt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: "🚚", text: "Envío rápido" },
            { icon: "💰", text: "Paga al recibir" },
            { icon: "🇨🇴", text: "Hecho en Colombia" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex flex-col items-center gap-1">
              <span className="text-lg">{icon}</span>
              <span className="text-[10px] text-gray-500 font-medium leading-tight">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
