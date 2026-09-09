"use client";

/**
 * Selector de producto en la cabecera del checkout.
 *
 * Solo aparece con `?elegir=1`. Existe para las campañas con cupón: el link de
 * una promoción no debería obligar a comprar el probiótico porque sea el
 * producto por defecto del checkout. Quien llega con el descuento puesto elige
 * qué se lleva.
 *
 * Fuera de ese modo el checkout se comporta exactamente igual que antes: este
 * componente no se monta y el producto lo sigue fijando el `?product=` de la
 * URL o el principal.
 */

import Image from "next/image";
import { CheckoutProduct } from "@/types/checkout";

function formatCOP(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n);
}

/** Precio más bajo del producto: es el que se anuncia en la tarjeta. */
function precioDesde(p: CheckoutProduct): number {
  const precios = p.variants.map((v) => Math.round(parseFloat(v.price ?? "0"))).filter((n) => n > 0);
  return precios.length ? Math.min(...precios) : 0;
}

export default function SelectorProductos({
  catalogo,
  seleccionadoId,
  onElegir,
}: {
  catalogo: CheckoutProduct[];
  seleccionadoId: string | number | null;
  onElegir: (p: CheckoutProduct) => void;
}) {
  if (catalogo.length === 0) return null;

  return (
    <section className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Elige tu producto</h2>
          <span className="text-[11px] text-gray-400">Tu descuento se mantiene</span>
        </div>

        {/*
          Carrusel horizontal en móvil y rejilla en escritorio. En móvil una
          rejilla dejaría las tarjetas demasiado estrechas para leer el nombre,
          y de ahí vienen la mayoría de las compras.
        */}
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory
                     sm:mx-0 sm:px-0 sm:overflow-visible sm:grid sm:grid-cols-3 lg:grid-cols-4"
        >
          {catalogo.map((p) => {
            const activo = String(p.id) === String(seleccionadoId);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onElegir(p)}
                aria-pressed={activo}
                className={`flex-shrink-0 w-[9.5rem] sm:w-auto snap-start text-left rounded-lg border-2 overflow-hidden transition-colors ${
                  activo
                    ? "border-[#fc5245] bg-[#fc5245]/5"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="relative w-full aspect-square bg-gray-50">
                  {p.images[0]?.src ? (
                    <Image
                      src={p.images[0].src}
                      alt={p.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 40vw, 20vw"
                    />
                  ) : null}
                  {activo && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#fc5245] text-white flex items-center justify-center">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-[11px] leading-tight text-gray-900 line-clamp-2 min-h-[2.1em]">
                    {p.title}
                  </p>
                  <p className="text-xs font-bold text-gray-900 mt-1">
                    {formatCOP(precioDesde(p))}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
