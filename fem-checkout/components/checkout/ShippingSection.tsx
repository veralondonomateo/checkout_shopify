export default function ShippingSection() {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 animate-fade-in-up">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#ffa69e] to-[#fc5245] flex items-center justify-center shadow-sm">
          <span className="text-white text-xs font-bold">3</span>
        </div>
        <h2 className="font-semibold text-gray-900">Método de envío</h2>
      </div>

      <div className="flex items-center justify-between bg-gradient-to-r from-[#fff0f0] to-[#fff8f8] rounded-xl border-2 border-[#ffa69e]/40 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-[#ffa69e]/20">
            <svg className="w-5 h-5 text-[#fc5245]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Envío estándar</p>
            <p className="text-xs text-gray-500">3-5 días hábiles · Todo Colombia</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 line-through">$15.000</span>
          <span className="text-sm font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
            GRATIS
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
        <svg className="w-3.5 h-3.5 text-[#ffa69e] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Recibirás un mensaje de WhatsApp con el número de guía para rastrear tu pedido
      </div>
    </section>
  );
}
