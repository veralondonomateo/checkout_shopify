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

// Detect "1 unidad" and "2 unidades" variants (compra única)
function getQuantityLinks(product: ShopifyProduct) {
  const v1 = product.variants.find((v) => /\b1\s*unidad\b/i.test(v.title));
  const v2 = product.variants.find((v) => /\b2\s*unidades?\b/i.test(v.title));

  const basePrice = parseFloat(product.variants[0]?.price ?? "0");
  const base = product.variants[0];

  const link1 = v1
    ? {
        url: `${APP_URL}/checkout?product=${product.handle}&variant=${v1.id}`,
        price: parseFloat(v1.price),
        variantId: v1.id,
        label: "1 und",
      }
    : {
        url: `${APP_URL}/checkout?product=${product.handle}`,
        price: basePrice,
        variantId: base?.id,
        label: "1 und",
      };

  const link2 = v2
    ? {
        url: `${APP_URL}/checkout?product=${product.handle}&variant=${v2.id}`,
        price: parseFloat(v2.price),
        variantId: v2.id,
        label: "2 und",
      }
    : {
        url: `${APP_URL}/checkout?product=${product.handle}&qty=2`,
        price: basePrice * 2,
        variantId: null,
        label: "2 und",
      };

  return { link1, link2 };
}

export default function AdminClient() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

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

  const copyLink = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopied(key);
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
        <h1 className="text-lg font-bold text-gray-900 mb-1">Links de checkout</h1>
        <p className="text-xs text-gray-400 mb-6">Cada producto tiene link para 1 und y 2 und. Precios desde Shopify.</p>

        {products.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500 text-sm">No hay productos activos en Shopify.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => {
              const { link1, link2 } = getQuantityLinks(product);

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
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-3 line-clamp-2">
                      {product.title}
                    </h3>

                    {/* 1 unidad */}
                    <LinkRow
                      label="1 und"
                      price={link1.price}
                      url={link1.url}
                      copiedKey={`${product.id}-1`}
                      activeCopied={copied}
                      onCopy={copyLink}
                    />

                    {/* 2 unidades */}
                    <LinkRow
                      label="2 und"
                      price={link2.price}
                      url={link2.url}
                      copiedKey={`${product.id}-2`}
                      activeCopied={copied}
                      onCopy={copyLink}
                    />
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

function LinkRow({
  label,
  price,
  url,
  copiedKey,
  activeCopied,
  onCopy,
}: {
  label: string;
  price: number;
  url: string;
  copiedKey: string;
  activeCopied: string | null;
  onCopy: (url: string, key: string) => void;
}) {
  const isCopied = activeCopied === copiedKey;
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex-1 min-w-0 bg-gray-50 rounded-md border border-gray-200 px-2.5 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0">
            {label}
          </span>
          <span className="text-xs font-bold text-[#fc5245] flex-shrink-0">
            {formatCOP(price)}
          </span>
        </div>
        <p className="text-[10px] text-gray-400 truncate font-mono mt-0.5">
          {url.replace(/^https?:\/\/[^/]+/, "")}
        </p>
      </div>
      <button
        onClick={() => onCopy(url, copiedKey)}
        title="Copiar link"
        className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
          isCopied
            ? "bg-green-500 text-white"
            : "bg-[#fc5245] text-white hover:bg-[#e83d30]"
        }`}
      >
        {isCopied ? (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Ver checkout"
        className="flex-shrink-0 w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </div>
  );
}
