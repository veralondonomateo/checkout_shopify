import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verificarToken, CUPON_RECUPERACION } from "@/lib/carritos";

/**
 * `/r/<token>` — el link corto que va en el mensaje de WhatsApp.
 *
 * Redirige al checkout con el producto, la cantidad y (si el token lo dice) el
 * cupón ya puestos. Existe para que el mensaje lleve **una sola cadena**: el
 * botón de URL dinámica de Meta queda como `checkoutfem.com/r/{{1}}`, que
 * aprueba más fácil que una variable con varios parámetros dentro.
 *
 * Si algo falla —token inválido, carrito borrado, base caída— manda al
 * checkout normal en vez de mostrar un error: la clienta abrió el link para
 * comprar, y perder la venta es peor que perder la precarga.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const destino = new URL("/checkout", req.nextUrl.origin);

  const verificado = verificarToken(token);
  if (!verificado) {
    return NextResponse.redirect(destino, 302);
  }

  const { tipo, id, conDescuento } = verificado;

  // El token va entero al checkout: es lo que dispara la precarga de los datos
  // de la clienta (ver /api/checkout/recuperar).
  destino.searchParams.set("r", token);
  if (conDescuento) destino.searchParams.set("cupon", CUPON_RECUPERACION);

  try {
    const supabase = createServerClient();

    if (tipo === "pago_no_completado") {
      // La variante y la cantidad viven en las líneas del pedido.
      const { data } = await supabase
        .from("order_items")
        .select("shopify_variant_id, quantity")
        .eq("order_id", id)
        .not("shopify_variant_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (data?.shopify_variant_id) {
        destino.searchParams.set("variant", String(data.shopify_variant_id));
        if (data.quantity > 1) destino.searchParams.set("qty", String(data.quantity));
      }
    } else {
      const { data } = await supabase
        .from("checkout_sessions")
        .select("variant_id, qty")
        .eq("id", id)
        .maybeSingle();

      if (data?.variant_id) {
        destino.searchParams.set("variant", String(data.variant_id));
        if (data.qty && data.qty > 1) destino.searchParams.set("qty", String(data.qty));
      }
    }
  } catch (err) {
    // Sin variante el checkout muestra el producto principal: se pierde la
    // precisión del carrito, no la venta.
    console.error("[Recuperación] No se pudo resolver el carrito:", err);
  }

  return NextResponse.redirect(destino, 302);
}

export const dynamic = "force-dynamic";
