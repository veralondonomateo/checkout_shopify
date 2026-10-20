/**
 * Subida de pedidos de Ecuador a Mastershop, el operador logístico.
 *
 * Solo Ecuador: Colombia llega a Mastershop por otro camino (vía Shopify) y
 * este módulo no lo toca. La llave es la del negocio de Ecuador en Mastershop
 * ("FEM PROBIOTICS", que factura en USD), y vive en MASTERSHOP_EC_API_KEY.
 *
 * El contrato de POST /api/orders no está en la documentación que nos dieron;
 * los campos salen de los errores de validación de la propia API y de la
 * respuesta del primer pedido subido.
 */

const BASE = "https://prod.api.mastershop.com";

/**
 * Único producto del negocio de Ecuador en Mastershop: "PROBIÓTICOS FEM".
 * La variante y el SKU no aparecen en GET /api/products; salieron de la
 * respuesta al subir el primer pedido (#2968041, 2026-10-20).
 */
export const PRODUCTO_MASTERSHOP_EC = 256891;
const VARIANTE_MASTERSHOP_EC = 715691;
const SKU_MASTERSHOP_EC = "P000013722";

/**
 * Mastershop exige documento en todos los pedidos, pero en Ecuador todavía no
 * facturamos y no se lo pedimos a la clienta. Sin cédula se envía el número de
 * "consumidor final" que usa el SRI.
 */
const DOCUMENTO_CONSUMIDOR_FINAL = "9999999999999";

/** Peso por unidad en kilos. Mastershop no tiene el peso cargado en el producto. */
const PESO_UNIDAD_KG = 0.2;

export interface PedidoParaMastershop {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  cedula: string | null;
  telefono: string;
  direccion: string;
  complemento: string | null;
  provincia: string;
  ciudad: string;
  unidades: number;
  total: number;
  moneda: string;
}

export type ResultadoMastershop =
  | { ok: true; idMastershop: string | null }
  | { ok: false; error: string };

function cuerpo(p: PedidoParaMastershop) {
  const nombreCompleto = `${p.nombre} ${p.apellido}`.trim();
  const direccion = {
    first_name: p.nombre,
    last_name: p.apellido,
    full_name: nombreCompleto,
    phone: p.telefono,
    // Mastershop no acepta vacío ni signos aquí.
    company: "Particular",
    address1: p.direccion,
    address2: p.complemento ?? "",
    city: p.ciudad,
    state: p.provincia,
    country: "EC",
    // Obligatorio y no vacío; Mastershop resuelve la zona por ciudad y
    // provincia, no por código postal.
    zip: "000000",
  };
  return {
    // Nuestro ID: es lo que permite cruzar el pedido entre los dos sistemas.
    id_order: p.id,
    shipping_address: direccion,
    billing_address: direccion,
    customer: {
      first_name: p.nombre,
      last_name: p.apellido,
      full_name: nombreCompleto,
      email: p.email,
      phone: p.telefono,
      documentType: "CC",
      documentNumber: p.cedula?.replace(/\D/g, "") || DOCUMENTO_CONSUMIDOR_FINAL,
    },
    order_transaction: {
      total: p.total,
      currency: p.moneda,
      payment_method: "cod",
    },
    order_items: [
      {
        id_product: PRODUCTO_MASTERSHOP_EC,
        id_variant: VARIANTE_MASTERSHOP_EC,
        sku: SKU_MASTERSHOP_EC,
        name: "PROBIÓTICOS FEM",
        quantity: p.unidades,
        // Precio unitario, para que unidades × precio cuadre con lo cobrado.
        price: Math.round((p.total / p.unidades) * 100) / 100,
        weight: PESO_UNIDAD_KG * p.unidades,
      },
    ],
  };
}

/** El ID que Mastershop le asignó al pedido (`idOrder` en la respuesta). */
function idDeRespuesta(datos: unknown): string | null {
  const id = (datos as { idOrder?: unknown } | null)?.idOrder;
  return typeof id === "number" || (typeof id === "string" && id) ? String(id) : null;
}

export async function subirPedidoMastershop(p: PedidoParaMastershop): Promise<ResultadoMastershop> {
  const llave = process.env.MASTERSHOP_EC_API_KEY;
  if (!llave) return { ok: false, error: "Falta MASTERSHOP_EC_API_KEY" };

  try {
    const res = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: {
        "ms-api-key": llave,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(cuerpo(p)),
      signal: AbortSignal.timeout(20_000),
    });
    const texto = await res.text();
    let datos: unknown = null;
    try { datos = JSON.parse(texto); } catch { /* respuesta no JSON */ }

    const fallo =
      !res.ok ||
      (datos && typeof datos === "object" && (datos as { success?: boolean }).success === false);
    if (fallo) {
      const detalle =
        (datos as { error?: string } | null)?.error ?? texto.slice(0, 300);
      return { ok: false, error: `Mastershop ${res.status}: ${detalle}`.slice(0, 500) };
    }
    return { ok: true, idMastershop: idDeRespuesta(datos) };
  } catch (err) {
    return { ok: false, error: `No se pudo conectar con Mastershop: ${String(err)}`.slice(0, 500) };
  }
}

/**
 * Sube un pedido guardado en `pedidos_ecuador` y anota el resultado en la
 * misma fila. Se usa al crear el pedido y desde el panel, para reintentar los
 * que fallaron o subir los que entraron antes de esta integración.
 *
 * Un pedido que ya tiene ID de Mastershop no se vuelve a subir: duplicarlo
 * sería despachar dos veces.
 */
export async function subirYRegistrar(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  pedidoId: string
): Promise<ResultadoMastershop> {
  const { data: p, error } = await supabase
    .from("pedidos_ecuador")
    .select("id, email, nombre, apellido, cedula, telefono, direccion, complemento, provincia, ciudad, unidades, total, moneda, operador_pedido_id")
    .eq("id", pedidoId)
    .maybeSingle();
  if (error || !p) return { ok: false, error: "Pedido no encontrado" };
  if (p.operador_pedido_id) return { ok: true, idMastershop: p.operador_pedido_id };

  const r = await subirPedidoMastershop({ ...p, total: Number(p.total) });
  await supabase
    .from("pedidos_ecuador")
    .update(
      r.ok
        ? { operador: "mastershop", operador_pedido_id: r.idMastershop ?? "subido", operador_error: null }
        : { operador: "mastershop", operador_error: r.error }
    )
    .eq("id", pedidoId);

  if (r.ok) console.log(`[Mastershop EC] Pedido ${pedidoId} subido (${r.idMastershop})`);
  else console.error(`[Mastershop EC] Pedido ${pedidoId} no subió: ${r.error}`);
  return r;
}
