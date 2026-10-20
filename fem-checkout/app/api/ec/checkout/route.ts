import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import {
  ENVIO_EC,
  MONEDA_EC,
  presentacionPorSlug,
  PRESENTACIONES_EC,
} from "@/lib/productos-ecuador";
import { PROVINCIAS_EC } from "@/data/provincias-ecuador";
import { cedulaValidaEC, normalizarCelularEC } from "@/lib/datos-ecuador";
import { sendPurchaseEvent } from "@/lib/meta";
import { subirYRegistrar } from "@/lib/mastershop-ec";

/**
 * Alta de pedidos de Ecuador.
 *
 * Escribe en `pedidos_ecuador` y **no despacha nada**: no hay operador
 * conectado todavía. El pedido queda guardado, con su estado en "pendiente",
 * listo para que el siguiente paso lo recoja.
 *
 * Es un gemelo reducido de /api/checkout, no una rama suya. Comparte las dos
 * redes anti-duplicado (clave de idempotencia y huella de contenido) porque
 * ese problema es el mismo en cualquier país, pero no toca ni una línea del
 * flujo colombiano.
 */

/** Ventana de la segunda red anti-duplicados. Igual que en Colombia. */
const DEDUP_WINDOW_MS = 30 * 60 * 1000;

interface CuerpoEC {
  email: string;
  nombre: string;
  apellido: string;
  cedula?: string;
  telefono: string;
  direccion: string;
  complemento?: string;
  provincia: string;
  ciudad: string;
  presentacion: string;
  idempotencyKey?: string;
  eventSourceUrl?: string;
  fbp?: string;
  fbc?: string;
}

/**
 * Huella del pedido. La clave de idempotencia vive en `sessionStorage` y es
 * por pestaña; esta no depende del navegador, así que atrapa a quien vuelve a
 * abrir el link y repite el pedido.
 */
function huellaContenido(b: CuerpoEC, total: number): string {
  const base = [
    b.email.trim().toLowerCase(),
    b.telefono.replace(/\D/g, ""),
    b.presentacion,
    total.toFixed(2),
  ].join("~");
  return createHash("sha256").update(base).digest("hex");
}

const noVacio = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  let body: CuerpoEC;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // ── Validación ───────────────────────────────────────────────────────────
  const faltantes = (
    ["email", "nombre", "apellido", "telefono", "direccion", "complemento", "provincia", "ciudad"] as const
  ).filter((c) => !noVacio(body[c]));

  if (faltantes.length > 0) {
    return NextResponse.json(
      { error: "Faltan datos obligatorios.", codigo: "datos_incompletos" },
      { status: 400 }
    );
  }

  // Correo: se exige arroba, punto y algo razonable a cada lado. No pretende
  // validar que exista, solo descartar lo que seguro no es un correo.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(body.email.trim())) {
    return NextResponse.json(
      { error: "Ese correo no parece válido.", codigo: "email_invalido" },
      { status: 400 }
    );
  }

  // Celular de Ecuador: la entrega se coordina por WhatsApp, y un número de
  // otro país deja el pedido sin forma de confirmarse.
  const celular = normalizarCelularEC(body.telefono);
  if (!celular) {
    return NextResponse.json(
      { error: "Escribe un celular de Ecuador, por ejemplo 0991234567.", codigo: "telefono_invalido" },
      { status: 400 }
    );
  }

  // La cédula es opcional mientras no facturemos en Ecuador; si la escriben,
  // que por lo menos tenga la forma de una.
  if (noVacio(body.cedula) && !cedulaValidaEC(body.cedula)) {
    return NextResponse.json(
      { error: "La cédula debe tener 10 dígitos.", codigo: "cedula_invalida" },
      { status: 400 }
    );
  }

  // La provincia tiene que ser una de las 24 reales: el navegador puede mentir
  // y un pedido con provincia inventada no se puede despachar.
  if (!PROVINCIAS_EC.some((p) => p.name === body.provincia.trim())) {
    return NextResponse.json(
      { error: "Selecciona una provincia válida.", codigo: "provincia_invalida" },
      { status: 400 }
    );
  }

  // ── Precio: lo pone el servidor, nunca el navegador ──────────────────────
  if (!PRESENTACIONES_EC.some((p) => p.slug === body.presentacion)) {
    return NextResponse.json(
      { error: "Esa presentación no existe.", codigo: "presentacion_invalida" },
      { status: 400 }
    );
  }
  const presentacion = presentacionPorSlug(body.presentacion);
  const subtotal = presentacion.precio;
  const total = Math.round((subtotal + ENVIO_EC) * 100) / 100;

  // ── Anti-duplicados ──────────────────────────────────────────────────────
  const idempotencyKey = body.idempotencyKey?.trim() || null;
  const huella = huellaContenido(body, total);
  let pedidoId: string | null = null;
  // Solo un pedido nuevo es una compra nueva: un reintento no se le vuelve a
  // contar a Meta.
  let esNuevo = false;
  const fbp = body.fbp ?? req.cookies.get("_fbp")?.value ?? null;
  const fbc = body.fbc ?? req.cookies.get("_fbc")?.value ?? null;
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const clientUserAgent = req.headers.get("user-agent") ?? null;

  if (idempotencyKey) {
    const { data } = await supabase
      .from("pedidos_ecuador")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (data) pedidoId = data.id;
  }

  if (!pedidoId) {
    const desde = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("pedidos_ecuador")
      .select("id")
      .eq("content_hash", huella)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) pedidoId = data.id;
  }

  if (!pedidoId) {
    const { data, error } = await supabase
      .from("pedidos_ecuador")
      .insert({
        email: body.email.trim().toLowerCase(),
        nombre: body.nombre.trim(),
        apellido: body.apellido.trim(),
        cedula: body.cedula?.replace(/\D/g, "") || null,
        telefono: celular,
        direccion: body.direccion.trim(),
        complemento: body.complemento!.trim(),
        provincia: body.provincia.trim(),
        ciudad: body.ciudad.trim(),
        presentacion: presentacion.slug,
        unidades: presentacion.unidades,
        precio_unitario: Math.round((presentacion.precio / presentacion.unidades) * 100) / 100,
        subtotal,
        envio: ENVIO_EC,
        total,
        moneda: MONEDA_EC,
        metodo_pago: "contraentrega",
        estado_pago: "pendiente",
        idempotency_key: idempotencyKey,
        content_hash: huella,
        fbp,
        fbc,
        client_ip: clientIp,
        client_user_agent: clientUserAgent,
        event_source_url: body.eventSourceUrl ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      // 23505 = otra petición idéntica ganó la carrera por el índice único.
      if (error?.code === "23505" && idempotencyKey) {
        const { data: ganador } = await supabase
          .from("pedidos_ecuador")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (ganador) pedidoId = ganador.id;
      }
      if (!pedidoId) {
        console.error("[Checkout EC] No se pudo registrar el pedido:", error);
        return NextResponse.json({ error: "No se pudo registrar el pedido" }, { status: 500 });
      }
    } else {
      pedidoId = data.id;
      esNuevo = true;
    }
  }

  // Contra entrega cuenta como compra al registrarse, igual que en Colombia.
  // Se espera la respuesta: en Vercel, lo que queda corriendo después de
  // responder se puede cortar, y es un solo llamado corto.
  if (esNuevo) {
    await sendPurchaseEvent({
      pais: "ec",
      orderId: pedidoId!,
      email: body.email,
      phone: celular,
      value: total,
      currency: MONEDA_EC,
      firstName: body.nombre,
      lastName: body.apellido,
      city: body.ciudad,
      state: body.provincia,
      eventSourceUrl: body.eventSourceUrl,
      clientIp: clientIp ?? undefined,
      clientUserAgent: clientUserAgent ?? undefined,
      fbp: fbp ?? undefined,
      fbc: fbc ?? undefined,
      contents: [{ id: `ec-${presentacion.slug}`, quantity: presentacion.unidades, price: presentacion.precio / presentacion.unidades }],
    }).catch(() => {});

    // Subida al operador. Un fallo no tumba la venta: el pedido ya está
    // guardado, queda el error anotado y se reintenta desde el panel.
    await subirYRegistrar(supabase, pedidoId!).catch((err) =>
      console.error("[Mastershop EC] Error inesperado:", err)
    );
  }

  console.log(`[Checkout EC] Pedido ${pedidoId} — ${presentacion.slug} — ${total} ${MONEDA_EC}`);

  return NextResponse.json({
    ok: true,
    pedido_id: pedidoId,
    total,
    moneda: MONEDA_EC,
  });
}
