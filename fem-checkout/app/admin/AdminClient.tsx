"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  variants: ShopifyVariant[];
  images: { src: string }[];
}

function formatCOP(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(n);
}

const APP_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://checkoutfem.com";

export default function AdminClient() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/products", {
        headers: { "x-admin-password": password },
      });
      if (res.status === 401) {
        setError("Contraseña incorrecta");
        return;
      }
      if (!res.ok) {
        setError("Error al conectar con Shopify. Verifica las variables de entorno.");
        return;
      }
      const data = await res.json();
      setProducts(data.products);
      setAuthenticated(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = (handle: string, id: number) => {
    const url = `${APP_URL}/checkout?product=${handle}`;
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 w-full max-w-sm shadow-sm">
          <div className="text-center mb-6">
            <Link href="/">
              <Image src="/logo.svg" alt="FEM" width={80} height={26} className="h-7 w-auto mx-auto" />
            </Link>
            <p className="text-sm text-gray-500 mt-3">Panel de administración</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-[#fc5245] focus:border-[#fc5245]"
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2.5 bg-[#fc5245] text-white text-sm font-semibold rounded-md hover:bg-[#e83d30] transition-colors disabled:opacity-50"
            >
              {loading ? "Conectando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Image src="/logo.svg" alt="FEM" width={80} height={26} className="h-7 w-auto" />
            </Link>
            <span className="text-xs text-gray-400 border-l border-gray-200 pl-3">
              Admin — {products.length} productos
            </span>
          </div>
          <button
            onClick={() => { setAuthenticated(false); setProducts([]); setPassword(""); }}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-lg font-bold text-gray-900 mb-6">Productos y links de checkout</h1>

        {products.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-sm">No hay productos activos en Shopify.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
              const price = parseFloat(product.variants[0]?.price ?? "0");
              const checkoutUrl = `${APP_URL}/checkout?product=${product.handle}`;
              const isCopied = copied === product.id;

              return (
                <div
                  key={product.id}
                  className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Imagen */}
                  <div className="relative w-full aspect-square bg-gray-50">
                    {product.images[0] ? (
                      <Image
                        src={product.images[0].src}
                        alt={product.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2">
                      {product.title}
                    </h3>
                    <p className="text-sm font-bold text-[#fc5245] mb-1">
                      {formatCOP(price)}
                    </p>
                    <p className="text-[11px] text-gray-400 mb-3 truncate">
                      {product.handle}
                    </p>

                    {/* URL */}
                    <div className="bg-gray-50 rounded-md border border-gray-200 px-2.5 py-1.5 mb-3">
                      <p className="text-[10px] text-gray-500 truncate font-mono">
                        /checkout?product={product.handle}
                      </p>
                    </div>

                    {/* Botones */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyLink(product.handle, product.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                          isCopied
                            ? "bg-green-500 text-white"
                            : "bg-[#fc5245] text-white hover:bg-[#e83d30]"
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            ¡Copiado!
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copiar link
                          </>
                        )}
                      </button>
                      <a
                        href={checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-md border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Ver
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
