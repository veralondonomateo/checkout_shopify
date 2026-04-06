"use client";

import { useEffect, useState } from "react";

export default function ExitIntentPopup() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 min

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("fem-exit-shown")) return;

    let ready = false;
    const readyTimer = setTimeout(() => { ready = true; }, 5000);

    const handleLeave = (e: MouseEvent) => {
      if (e.clientY <= 5 && ready) {
        setShow(true);
        sessionStorage.setItem("fem-exit-shown", "1");
      }
    };

    document.addEventListener("mouseleave", handleLeave);
    return () => {
      document.removeEventListener("mouseleave", handleLeave);
      clearTimeout(readyTimer);
    };
  }, []);

  useEffect(() => {
    if (!show || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [show, timeLeft]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleCopy = () => {
    navigator.clipboard.writeText("MISTERIOSO").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={() => setShow(false)}
      />
      <div className="relative bg-white rounded-lg shadow-2xl max-w-sm w-full z-10 overflow-hidden">
        {/* Top accent */}
        <div className="h-1 bg-[#fc5245]" />

        <div className="p-6">
          {/* Close */}
          <button
            onClick={() => setShow(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Cerrar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Icon */}
          <div className="w-10 h-10 bg-[#fc5245]/10 rounded-full flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-[#fc5245]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>

          {/* Headline */}
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            ¿Te vas con las manos vacías?
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Completa tu pedido <span className="font-semibold text-gray-700">ahora mismo</span> y
            obtén un <span className="font-semibold text-[#fc5245]">5% adicional</span> de descuento.
          </p>

          {/* Code */}
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-md p-3.5 mb-4 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Tu código misterioso</p>
            <p className="text-2xl font-bold tracking-widest text-gray-900">MISTERIOSO</p>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="w-full mb-3 py-2.5 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                ¡Código copiado!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar código
              </>
            )}
          </button>

          {/* Countdown */}
          {timeLeft > 0 ? (
            <div className="flex items-center justify-center gap-2 mb-4 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 text-[#fc5245]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Esta oferta expira en{" "}
              <span className="font-bold text-gray-900 tabular-nums">{fmt(timeLeft)}</span>
            </div>
          ) : (
            <p className="text-xs text-center text-red-500 mb-4 font-medium">La oferta expiró</p>
          )}

          {/* CTA */}
          <button
            onClick={() => setShow(false)}
            className="w-full py-3 rounded-md bg-[#fc5245] text-white text-sm font-semibold hover:bg-[#e83d30] transition-colors"
          >
            Completar mi compra →
          </button>

          {/* Dismiss */}
          <button
            onClick={() => setShow(false)}
            className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            No gracias, prefiero pagar precio completo
          </button>
        </div>
      </div>
    </div>
  );
}
