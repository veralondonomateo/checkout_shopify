"use client";

/**
 * Módulo Ecuador del panel.
 *
 * Dos cosas: los links para pasar a pauta y los pedidos que van entrando.
 * Vive aparte del dashboard de Colombia porque son operaciones distintas —otra
 * moneda, otro catálogo, otra tabla— y mezclarlas haría que las cifras de una
 * contaminaran las de la otra.
 */

import { useCallback, useEffect, useState } from "react";
import { useAdminPassword } from "../AdminShell";
import { PRESENTACIONES_EC, PRODUCTO_EC, formatUSD } from "@/lib/productos-ecuador";
import { avisosPedidoEC } from "@/lib/datos-ecuador";

interface PedidoEC {
  id: string;
  created_at: string;
  nombre: string;
  apellido: string;
  cedula: string | null;
  email: string;
  telefono: string;
  provincia: string;
  ciudad: string;
  direccion: string;
  complemento: string | null;
  presentacion: string;
  unidades: number;
  total: number | string;
  metodo_pago: string;
  estado_pago: string;
  despachado_at: string | null;
  operador_pedido_id: string | null;
  operador_error: string | null;
}

const APP_URL =
  typeof window !== "undefined" ? window.location.origin : "https://checkoutfem.com";

function fechaCorta(iso: string) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Guayaquil",
  }).format(new Date(iso));
}

/** Bloque de texto con todo lo que pide la transportadora, listo para pegar. */
function datosEnvio(p: PedidoEC): string {
  return [
    `Nombre: ${p.nombre} ${p.apellido}`,
    `Cédula: ${p.cedula ?? "—"}`,
    `Celular: ${p.telefono}`,
    `Correo: ${p.email}`,
    `Provincia: ${p.provincia}`,
    `Ciudad: ${p.ciudad}`,
    `Dirección: ${p.direccion}`,
    `Referencia: ${p.complemento ?? "—"}`,
    `Producto: ${PRODUCTO_EC.nombre} x ${p.unidades}`,
    `Cobrar contra entrega: ${formatUSD(Number(p.total))}`,
  ].join("\n");
}

const COLUMNAS_CSV: [string, (p: PedidoEC) => string][] = [
  ["Fecha", (p) => fechaCorta(p.created_at)],
  ["Pedido", (p) => p.id.slice(0, 8).toUpperCase()],
  ["Nombre", (p) => p.nombre],
  ["Apellido", (p) => p.apellido],
  ["Cédula", (p) => p.cedula ?? ""],
  ["Celular", (p) => p.telefono],
  ["Correo", (p) => p.email],
  ["Provincia", (p) => p.provincia],
  ["Ciudad", (p) => p.ciudad],
  ["Dirección", (p) => p.direccion],
  ["Referencia", (p) => p.complemento ?? ""],
  ["Unidades", (p) => String(p.unidades)],
  ["Total a cobrar (USD)", (p) => Number(p.total).toFixed(2)],
  ["Pago", (p) => p.metodo_pago],
  ["Avisos", (p) => avisosPedidoEC(p).join(" / ")],
];

/**
 * CSV con punto y coma y BOM: así Excel en español lo abre en columnas y con
 * las tildes bien, sin pasar por el asistente de importación.
 */
function descargarCSV(pedidos: PedidoEC[]) {
  const celda = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const filas = [
    COLUMNAS_CSV.map(([t]) => celda(t)).join(";"),
    ...pedidos.map((p) => COLUMNAS_CSV.map(([, f]) => celda(f(p))).join(";")),
  ];
  const blob = new Blob(["\uFEFF" + filas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pedidos-ecuador-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function EcuadorClient() {
  const password = useAdminPassword();
  const [pedidos, setPedidos] = useState<PedidoEC[]>([]);
  const [resumen, setResumen] = useState({ cantidad: 0, facturacion: 0, ticket: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ecuador", {
        headers: { "x-admin-password": password },
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setPedidos(d.pedidos ?? []);
      setResumen(d.resumen ?? { cantidad: 0, facturacion: 0, ticket: 0 });
    } catch {
      setError("No se pudieron cargar los pedidos");
    } finally {
      setCargando(false);
    }
  }, [password]);

  useEffect(() => { cargar(); }, [cargar]);

  const [subiendo, setSubiendo] = useState<string | null>(null);
  const subir = async (id: string) => {
    setSubiendo(id);
    try {
      await fetch("/api/admin/ecuador", {
        method: "POST",
        headers: { "x-admin-password": password, "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } finally {
      setSubiendo(null);
      cargar();
    }
  };

  const copiar = async (texto: string, clave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado(null), 1800);
    } catch { /* sin portapapeles: el link está a la vista para copiarlo a mano */ }
  };

  return (
    <div className="p-5 sm:p-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Ecuador</h1>
        <p className="text-sm text-gray-500 mt-1">
          Operación independiente: precios en dólares y pedidos en su propia
          tabla. Los pedidos nuevos se suben solos a Mastershop.
        </p>
      </header>

      {/* ── Links ──────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Links de compra</h2>
        <p className="text-xs text-gray-500 mb-4">{PRODUCTO_EC.nombre}</p>

        <div className="space-y-3">
          {PRESENTACIONES_EC.map((p) => {
            const url = `${APP_URL}/ec/checkout?p=${p.slug}`;
            return (
              <div key={p.slug} className="border border-gray-200 rounded-lg p-3.5">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-gray-900">{p.titulo}</span>
                    {p.precioAntes && (
                      <span className="text-xs text-gray-400 line-through">
                        {formatUSD(p.precioAntes)}
                      </span>
                    )}
                    <span className="text-sm font-bold text-[#fc5245]">{formatUSD(p.precio)}</span>
                  </div>
                  <button
                    onClick={() => copiar(url, p.slug)}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
                  >
                    {copiado === p.slug ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
                <code className="block text-[11px] text-gray-500 break-all bg-gray-50 rounded px-2.5 py-1.5">
                  {url}
                </code>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-4">
          Para cambiar precios o nombre del producto se edita
          <code className="mx-1 font-mono">lib/productos-ecuador.ts</code>
          y se despliega. No hay que tocar nada más.
        </p>
      </section>

      {/* ── Pedidos ────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Pedidos</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => descargarCSV(pedidos)}
              disabled={pedidos.length === 0}
              className="text-xs font-medium text-gray-900 hover:underline disabled:text-gray-300"
            >
              Descargar Excel
            </button>
            <button
              onClick={cargar}
              className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              Actualizar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <Dato etiqueta="Pedidos" valor={String(resumen.cantidad)} />
          <Dato etiqueta="Facturación" valor={formatUSD(resumen.facturacion)} />
          <Dato etiqueta="Ticket promedio" valor={formatUSD(resumen.ticket)} />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {cargando ? (
          <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>
        ) : pedidos.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            Todavía no hay pedidos de Ecuador.
          </p>
        ) : (
          <div className="space-y-3">
            {pedidos.map((p) => {
              const avisos = avisosPedidoEC(p);
              return (
                <article key={p.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {p.nombre} {p.apellido}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {fechaCorta(p.created_at)} · Pedido {p.id.slice(0, 8).toUpperCase()}
                        {p.despachado_at ? " · Despachado" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">
                        {p.unidades} und · {formatUSD(Number(p.total))}
                      </span>
                      <button
                        onClick={() => copiar(datosEnvio(p), p.id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                      >
                        {copiado === p.id ? "¡Copiado!" : "Copiar datos"}
                      </button>
                    </div>
                  </div>

                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <Campo etiqueta="Cédula" valor={p.cedula} />
                    <Campo etiqueta="Celular" valor={p.telefono} />
                    <Campo etiqueta="Correo" valor={p.email} />
                    <Campo etiqueta="Provincia / ciudad" valor={`${p.provincia} · ${p.ciudad}`} />
                    <Campo etiqueta="Dirección" valor={p.direccion} ancho />
                    <Campo etiqueta="Referencia" valor={p.complemento} ancho />
                  </dl>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    {p.operador_pedido_id ? (
                      <span className="text-green-700 bg-green-50 border border-green-200 rounded-md px-2.5 py-1">
                        En Mastershop{p.operador_pedido_id !== "subido" ? ` · #${p.operador_pedido_id}` : ""}
                      </span>
                    ) : (
                      <>
                        <span className="text-gray-500">
                          {p.operador_error ? "No subió a Mastershop" : "Sin subir a Mastershop"}
                        </span>
                        <button
                          onClick={() => subir(p.id)}
                          disabled={subiendo === p.id}
                          className="font-medium px-3 py-1.5 rounded-md border border-gray-300 text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {subiendo === p.id ? "Subiendo…" : "Subir a Mastershop"}
                        </button>
                      </>
                    )}
                  </div>
                  {!p.operador_pedido_id && p.operador_error && (
                    <p className="mt-2 text-[11px] text-red-600 break-words">{p.operador_error}</p>
                  )}

                  {avisos.length > 0 && (
                    <ul className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-0.5">
                      {avisos.map((a) => <li key={a}>⚠ {a}</li>)}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3.5 py-3">
      <p className="text-[11px] text-gray-400">{etiqueta}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{valor}</p>
    </div>
  );
}

function Campo({ etiqueta, valor, ancho }: { etiqueta: string; valor: string | null; ancho?: boolean }) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] text-gray-400">{etiqueta}</dt>
      <dd className={valor ? "text-gray-900 break-words" : "text-gray-300"}>{valor || "—"}</dd>
    </div>
  );
}
