"use client";

/**
 * Selector de productos en la cabecera del checkout.
 *
 * Solo aparece con `?elegir=1`. Existe para las campañas con cupón: el link de
 * una promoción no debería obligar a comprar el probiótico porque sea el
 * producto por defecto del checkout. Quien llega con el descuento puesto arma
 * su pedido.
 *
 * No es "elegir uno" sino "agregar varios": cada tarjeta suma al carrito con
 * el **+** y se quita con el **−**. Es la misma mecánica que los upsells de
 * más abajo, para que la clienta no tenga que aprender dos formas distintas de
 * añadir algo en la misma página.
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

/** Precio de la primera variante: es la que se agrega al carrito. */
export function precioDe(p: CheckoutProduct): number {
  return Math.round(parseFloat(p.variants[0]?.price ?? "0"));
}

export default function SelectorProductos({
  catalogo,
  cantidades,
  onAgregar,
  onQuitar,
  descuento,
  paraClientas,
  usosMax,
}: {
  catalogo: CheckoutProduct[];
  /** Cantidad en el carrito por id de producto. */
  cantidades: Record<string, number>;
  onAgregar: (p: CheckoutProduct) => void;
  onQuitar: (p: CheckoutProduct) => void;
  /** Descuento vigente (0.1 = 10 %). En 0 cuando no hay cupón o ya venció. */
  descuento: number;
  /** `?clientas=1`: el link va a quien ya compró, y el saludo lo reconoce. */
  paraClientas: boolean;
  /** Usos permitidos por clienta; undefined = sin límite. */
  usosMax?: number;
}) {
  if (catalogo.length === 0) return null;

  const enCarrito = Object.values(cantidades).reduce((s, n) => s + n, 0);
  const porcentaje = Math.round(descuento * 100);

  return (
    <section className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
        {/*
          Quien llega por el link de una campaña tiene que entender en un
          vistazo qué recibe: antes la página solo decía "Arma tu pedido" y
          el porcentaje no aparecía en ningún lado.
        */}
        {porcentaje > 0 ? (
          <div className="rounded-lg bg-[#fc5245]/5 border border-[#fc5245]/20 px-4 py-3 mb-4">
            {paraClientas && (
              <p className="text-[11px] font-medium text-[#fc5245] mb-0.5">
                Para ti, que ya eres parte de FEM
              </p>
            )}
            <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
              {paraClientas
                ? `Tienes ${porcentaje}% de descuento en todo tu pedido`
                : `${porcentaje}% de descuento en todo tu pedido`}
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              {paraClientas
                ? "Ya sabes lo que FEM hace por ti. Por eso este descuento es solo para clientas como tú: ya está aplicado, elige tus favoritos y verás el ahorro en el total."
                : "El descuento ya está aplicado: elige tus productos y verás el ahorro en el total."}
            </p>
            {/*
              Escasez solo con lo que es cierto: el contador sí quita el
              descuento al llegar a cero y el límite de usos lo impone el
              servidor. Nada de "quedan 3 unidades" inventado.
            */}
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-gray-700">
              <li>⏳ Reservado por tiempo limitado</li>
              {usosMax === 1 && <li>🔒 Válido una sola vez</li>}
              {usosMax !== undefined && usosMax > 1 && <li>🔒 Válido {usosMax} veces</li>}
              {paraClientas && <li>💛 Solo para clientas FEM</li>}
            </ul>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Arma tu pedido</h2>
          <span className="text-[11px] text-gray-400">
            {enCarrito === 0
              ? "Agrega lo que quieras llevar"
              : porcentaje > 0
                ? `Tu ${porcentaje}% aplica a todo`
                : "Agrega lo que quieras llevar"}
          </span>
        </div>

        {/*
          Carrusel horizontal en móvil y rejilla en escritorio. En móvil una
          rejilla dejaría las tarjetas demasiado estrechas para leer el nombre,
          y de ahí vienen la mayoría de las compras.
        */}
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x
                     sm:mx-0 sm:px-0 sm:overflow-visible sm:grid sm:grid-cols-3 lg:grid-cols-4"
        >
          {catalogo.map((p) => {
            const cantidad = cantidades[String(p.id)] ?? 0;
            const dentro = cantidad > 0;
            return (
              <div
                key={p.id}
                className={`flex-shrink-0 w-[10.5rem] sm:w-auto snap-start rounded-lg border-2 overflow-hidden transition-colors flex flex-col ${
                  dentro ? "border-[#fc5245] bg-[#fc5245]/5" : "border-gray-200 bg-white"
                }`}
              >
                <div className="relative w-full aspect-square bg-gray-50">
                  {p.images[0]?.src ? (
                    <Image
                      src={p.images[0].src}
                      alt={p.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 45vw, 20vw"
                    />
                  ) : null}
                  {dentro && (
                    <span className="absolute top-1.5 right-1.5 min-w-[1.4rem] h-5 px-1.5 rounded-full bg-[#fc5245] text-white text-[11px] font-bold flex items-center justify-center">
                      {cantidad}
                    </span>
                  )}
                </div>

                <div className="p-2.5 flex flex-col flex-1">
                  <p className="text-[11px] leading-tight text-gray-900 line-clamp-2 min-h-[2.1em]">
                    {p.title}
                  </p>
                  {porcentaje > 0 ? (
                    <div className="mt-1 mb-2">
                      <p className="text-[11px] text-gray-400 line-through leading-none">
                        {formatCOP(precioDe(p))}
                      </p>
                      <p className="text-xs font-bold text-[#fc5245] mt-0.5">
                        {formatCOP(Math.round(precioDe(p) * (1 - descuento)))}
                        <span className="ml-1 text-[10px] font-semibold">-{porcentaje}%</span>
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs font-bold text-gray-900 mt-1 mb-2">
                      {formatCOP(precioDe(p))}
                    </p>
                  )}

                  {/* El botón queda abajo del todo para que todas las tarjetas
                      lo tengan a la misma altura aunque el nombre ocupe una
                      línea o dos. */}
                  <div className="mt-auto">
                    {dentro ? (
                      <div className="flex items-center justify-between gap-1 rounded-md border border-[#fc5245] bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() => onQuitar(p)}
                          aria-label={`Quitar uno de ${p.title}`}
                          className="w-8 h-8 rounded flex items-center justify-center text-[#fc5245] hover:bg-[#fc5245]/10 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeWidth={2.5} d="M5 12h14" />
                          </svg>
                        </button>
                        <span className="text-sm font-bold text-gray-900 tabular-nums">
                          {cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAgregar(p)}
                          aria-label={`Agregar otro ${p.title}`}
                          className="w-8 h-8 rounded flex items-center justify-center text-[#fc5245] hover:bg-[#fc5245]/10 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAgregar(p)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md bg-[#fc5245] text-white text-xs font-semibold hover:bg-[#e83d30] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeWidth={3} d="M12 5v14M5 12h14" />
                        </svg>
                        Agregar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {enCarrito === 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">
            Agrega al menos un producto para continuar con tu pedido.
          </p>
        )}
      </div>
    </section>
  );
}
