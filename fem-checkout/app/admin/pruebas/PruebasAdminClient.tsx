"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { coberturaSendura, RESUMEN_COBERTURA } from "@/lib/cobertura-sendura";

/**
 * Módulo de pruebas de Sendura dentro del admin.
 *
 * Tres cosas, en este orden de importancia:
 *  1. El registro de cada pedido de prueba, con la guía o la orden de Shopify
 *     que salió — es lo que se revisa junto a Sendura.
 *  2. El payload exacto que se envió y lo que respondieron, para depurar
 *     nombres de ciudad y SKU sin adivinar.
 *  3. Un probador de cobertura, para responder "¿y tal municipio?" al instante.
 */

interface Prueba {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  state: string;
  city: string;
  payment_method: string;
  items: Array<{ name: string; variant?: string; quantity: number; price: number }>;
  total: number;
  carrier: "sendura" | "shopify";
  cobertura: boolean;
  motivo: string | null;
  status: "ok" | "error";
  sendura_order_id: string | null;
  sendura_guia: string | null;
  shopify_order_id: number | null;
  error: string | null;
  request_payload: unknown;
  response_payload: unknown;
}

const formatCOP = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n);

const formatFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PruebasAdminClient() {
  const [password, setPassword] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [pruebas, setPruebas] = useState<Prueba[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorLogin, setErrorLogin] = useState("");
  const [expandida, setExpandida] = useState<string | null>(null);

  const cargar = async (pw: string) => {
    const res = await fetch("/api/admin/pruebas", { headers: { "x-admin-password": pw } });
    if (res.status === 401) throw new Error("Contraseña incorrecta");
    if (!res.ok) throw new Error("Error al cargar el registro");
    const data = await res.json();
    setPruebas(data.pruebas ?? []);
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setErrorLogin("");
    try {
      await cargar(password);
      setAutenticado(true);
    } catch (err) {
      setErrorLogin(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setCargando(false);
    }
  };

  // Refresco manual: estas pruebas son pocas y manuales, no hace falta polling.
  const refrescar = async () => {
    setCargando(true);
    try {
      await cargar(password);
    } catch {
      /* se conserva lo que ya está en pantalla */
    } finally {
      setCargando(false);
    }
  };

  if (!autenticado) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 w-full max-w-sm shadow-sm">
          <div className="text-center mb-6">
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Pruebas Sendura
            </span>
            <p className="text-sm text-gray-500 mt-3">Registro de pedidos de prueba</p>
          </div>
          <form onSubmit={entrar} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña del admin"
              className="w-full px-3.5 py-2.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-[#fc5245] focus:border-[#fc5245]"
              autoFocus
            />
            {errorLogin && <p className="text-xs text-red-500">{errorLogin}</p>}
            <button
              type="submit"
              disabled={cargando || !password}
              className="w-full py-2.5 bg-[#fc5245] text-white text-sm font-semibold rounded-md hover:bg-[#e83d30] transition-colors disabled:opacity-50"
            >
              {cargando ? "Cargando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const aSendura = pruebas.filter((p) => p.carrier === "sendura");
  const aShopify = pruebas.filter((p) => p.carrier === "shopify");
  const fallidas = pruebas.filter((p) => p.status === "error");

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/admin" className="text-xs text-gray-500 hover:text-gray-900 flex-shrink-0">
              ← Admin
            </Link>
            <span className="text-sm font-semibold text-gray-900 truncate">
              Pruebas Sendura
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={refrescar}
              disabled={cargando}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {cargando ? "…" : "Refrescar"}
            </button>
            <Link
              href="/pruebas"
              className="text-xs px-3 py-1.5 bg-[#fc5245] text-white rounded-md font-semibold hover:bg-[#e83d30]"
            >
              Abrir checkout de prueba
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Resumen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tarjeta etiqueta="Pruebas" valor={pruebas.length} />
          <Tarjeta etiqueta="A Sendura" valor={aSendura.length} color="text-emerald-700" />
          <Tarjeta etiqueta="A Shopify" valor={aShopify.length} color="text-blue-700" />
          <Tarjeta etiqueta="Fallidas" valor={fallidas.length} color={fallidas.length ? "text-red-600" : undefined} />
        </div>

        <ProbadorCobertura />

        {/* Registro */}
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Pedidos de prueba</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Toca una fila para ver el payload enviado y la respuesta. Estos pedidos hay que
              anularlos a mano en Sendura y en Shopify.
            </p>
          </div>

          {pruebas.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-500">Todavía no hay pedidos de prueba.</p>
              <Link href="/pruebas" className="text-xs text-[#fc5245] font-medium mt-2 inline-block">
                Crear el primero →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pruebas.map((p) => (
                <div key={p.id}>
                  <button
                    onClick={() => setExpandida(expandida === p.id ? null : p.id)}
                    className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded flex-shrink-0 w-20 text-center ${
                        p.carrier === "sendura"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {p.carrier}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        {p.city} <span className="text-gray-400">· {p.state}</span>
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {p.first_name} {p.last_name} · {formatFecha(p.created_at)} ·{" "}
                        {p.payment_method}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      {p.status === "error" ? (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
                          error
                        </span>
                      ) : (
                        <p className="text-xs font-mono text-gray-700">
                          {p.sendura_guia
                            ? `guía ${p.sendura_guia}`
                            : p.shopify_order_id
                              ? `Shopify ${p.shopify_order_id}`
                              : "—"}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 tabular-nums">{formatCOP(p.total)}</p>
                    </div>
                  </button>

                  {expandida === p.id && (
                    <div className="px-5 pb-5 bg-gray-50 border-t border-gray-100 space-y-3">
                      <div className="pt-3 text-xs text-gray-600 space-y-1">
                        <p><span className="text-gray-400">Motivo:</span> {p.motivo ?? "—"}</p>
                        <p><span className="text-gray-400">Dirección:</span> {p.address}</p>
                        <p><span className="text-gray-400">Celular:</span> {p.phone}</p>
                        <p>
                          <span className="text-gray-400">Productos:</span>{" "}
                          {p.items?.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                        </p>
                      </div>

                      {p.error && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <p className="text-xs text-red-800 leading-relaxed">{p.error}</p>
                        </div>
                      )}

                      <Bloque titulo="Enviado" contenido={p.request_payload} />
                      {p.response_payload != null && (
                        <Bloque titulo="Respuesta" contenido={p.response_payload} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  color = "text-gray-900",
}: {
  etiqueta: string;
  valor: number;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{etiqueta}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}

function Bloque({ titulo, contenido }: { titulo: string; contenido: unknown }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{titulo}</p>
      <pre className="bg-gray-900 text-gray-100 text-[10px] p-3 rounded overflow-x-auto max-h-64">
        {JSON.stringify(contenido, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Probador de cobertura contra el catálogo real de ciudades.
 *
 * Busca sobre las 8.193 ciudades del selector, no sobre una lista aparte: si
 * aquí dice "Sendura", el checkout dirá exactamente lo mismo.
 */
function ProbadorCobertura() {
  const [consulta, setConsulta] = useState("");
  const [todas, setTodas] = useState<Array<{ state: string; city: string }>>([]);

  // El catálogo completo pesa ~195 KB: se descarga solo cuando alguien abre
  // este probador, no en el bundle del admin. Mismo criterio que el checkout.
  useEffect(() => {
    let vigente = true;
    import("@/data/states.json").then(({ default: data }) => {
      if (!vigente) return;
      setTodas(
        data.states.flatMap((s) => s.cities.map((c) => ({ state: s.name, city: c })))
      );
    });
    return () => {
      vigente = false;
    };
  }, []);

  const resultados = useMemo(() => {
    const q = consulta
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase();
    if (q.length < 3) return [];
    return todas
      .filter((x) =>
        x.city
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 12)
      .map((x) => ({ ...x, cobertura: coberturaSendura(x.state, x.city) }));
  }, [consulta, todas]);

  return (
    <section className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 text-sm mb-1">Probador de cobertura</h2>
      <p className="text-xs text-gray-400 mb-3">
        Escribe una ciudad como aparece en el formulario y mira a qué transportadora iría.
      </p>

      <input
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        placeholder="Ej. Envigado, Soacha, Cali…"
        className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-[#fc5245] focus:border-[#fc5245]"
      />

      {resultados.length > 0 && (
        <div className="mt-3 space-y-1">
          {resultados.map((r) => (
            <div
              key={`${r.state}-${r.city}`}
              className="flex items-center gap-3 text-xs py-1.5 px-2 rounded hover:bg-gray-50"
            >
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded w-20 text-center flex-shrink-0 ${
                  r.cobertura.cubierta
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {r.cobertura.cubierta ? "Sendura" : "Shopify"}
              </span>
              <span className="text-gray-900 flex-1 truncate">{r.city}</span>
              <span className="text-gray-400 flex-shrink-0">{r.state}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Cobertura configurada: {RESUMEN_COBERTURA.join(" · ")}
      </p>
    </section>
  );
}
