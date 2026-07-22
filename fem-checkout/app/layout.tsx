import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FEM | Finalizar compra",
  description: "Checkout seguro - FEM Suplementos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full`}>
      <head>
        {/* Las imágenes de producto (LCP) vienen del CDN de Shopify: abrimos la
            conexión antes de que el HTML termine de parsearse. */}
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="" />
        {/* Los pixeles cargan después del load; basta resolver el DNS por adelantado. */}
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://analytics.tiktok.com" />
        <link rel="dns-prefetch" href="https://static.klaviyo.com" />

        {/* TikTok Pixel base code — lazyOnload: no compite con la hidratación */}
        <Script id="tiktok-pixel" strategy="lazyOnload">{`
          !function (w, d, t) {
            w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
            var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
            ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
            ttq.load('D7EG6BJC77UB0P248N8G');
            ttq.page();
          }(window, document, 'ttq');
        `}</Script>
        {/* Meta Pixel base code */}
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '1382746760142604');
          fbq('track', 'PageView');
        `}</Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=1382746760142604&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        {/* ── Klaviyo onsite (popup/forms + tracking) — carga diferida ──────────
            klaviyo.js cuesta ~400 ms de main thread y arrastra ~14 archivos más
            para pintar el popup. Cargado durante el render competía con la
            hidratación del checkout.

            1) Proxy buffer (snippet oficial de Klaviyo): intercepta cualquier
               llamada temprana a window.klaviyo y la encola en _klOnsite, así
               nada se pierde aunque el script real todavía no exista.
            2) El tag lleva data-src en vez de src → el navegador no lo descarga.
            3) A la primera interacción (o 8 s tras el load) se copia data-src a
               src dentro de un requestIdleCallback.

            La configuración del popup vive en los servidores de Klaviyo, atada
            al company_id TDVtU4: esto solo cambia CUÁNDO se descarga el script,
            no toca diseño, targeting ni listas.
            Rollback: volver a <Script src="…klaviyo.js" strategy="lazyOnload" />. */}
        <script
          id="klaviyo-proxy"
          dangerouslySetInnerHTML={{
            __html: `!function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise((function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();`,
          }}
        />
        <script
          id="klaviyo-deferred"
          data-src="https://static.klaviyo.com/onsite/js/TDVtU4/klaviyo.js"
        />
        <script
          id="klaviyo-activator"
          dangerouslySetInnerHTML={{
            __html: `(function(){var done=false;var events=['mousedown','mousemove','keydown','scroll','touchstart','click'];function load(){if(done)return;done=true;events.forEach(function(e){window.removeEventListener(e,load,{passive:true})});var el=document.getElementById('klaviyo-deferred');if(!el||!el.getAttribute('data-src'))return;var go=function(){el.setAttribute('src',el.getAttribute('data-src'))};'requestIdleCallback' in window?requestIdleCallback(go):setTimeout(go,200)}events.forEach(function(e){window.addEventListener(e,load,{passive:true})});window.addEventListener('load',function(){setTimeout(load,8000)})})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
