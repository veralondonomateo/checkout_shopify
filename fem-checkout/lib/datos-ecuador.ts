/**
 * Validación de los datos de envío de Ecuador.
 *
 * La usan el formulario y el servidor, para que los dos rechacen lo mismo.
 * Existe porque los primeros pedidos llegaron imposibles de despachar:
 * celulares colombianos (311…, 321…), direcciones de Bogotá ("Carrera10#7-57")
 * y sin referencia. Una transportadora ecuatoriana no puede entregar eso, y el
 * pedido se perdía sin que nadie se enterara hasta intentar subirlo.
 */

/**
 * Celular ecuatoriano normalizado a `09XXXXXXXX`, o null si no lo es.
 *
 * Acepta las formas en que la gente lo escribe: 0991234567, 991234567,
 * +593 99 123 4567 o 593991234567. Un fijo o un número de otro país vuelve
 * null, porque el contacto para la entrega es por WhatsApp.
 */
export function normalizarCelularEC(valor: string): string | null {
  let d = valor.replace(/\D/g, "");
  if (d.startsWith("593")) d = d.slice(3);
  if (d.length === 9 && d.startsWith("9")) d = "0" + d;
  return /^09\d{8}$/.test(d) ? d : null;
}

/**
 * Cédula (10 dígitos) o RUC (13). Solo se revisa la forma: el dígito
 * verificador deja fuera a extranjeros con documentos que la transportadora sí
 * acepta, y rechazar una venta por eso cuesta más que lo que evita.
 */
export function cedulaValidaEC(valor: string): boolean {
  const d = valor.replace(/\D/g, "");
  return d.length === 10 || d.length === 13;
}

/** Números que el formulario muestra como ejemplo; si llegan tal cual, es una prueba. */
export const TELEFONO_EJEMPLO_EC = "0991234567";
export const DIRECCION_EJEMPLO_EC = "Av. Amazonas N34-56 y Av. Naciones Unidas";

/**
 * Avisos sobre un pedido ya guardado, para el panel. No bloquean nada: solo
 * dicen qué hay que confirmar con la clienta antes de subirlo.
 */
export function avisosPedidoEC(p: {
  telefono: string;
  cedula: string | null;
  direccion: string;
  complemento: string | null;
}): string[] {
  const avisos: string[] = [];
  if (p.telefono.replace(/\D/g, "") === TELEFONO_EJEMPLO_EC || p.direccion.trim() === DIRECCION_EJEMPLO_EC) {
    avisos.push("Parece una prueba: usa el teléfono o la dirección de ejemplo");
  } else if (!normalizarCelularEC(p.telefono)) {
    avisos.push("El celular no es de Ecuador");
  }
  if (p.cedula && !cedulaValidaEC(p.cedula)) avisos.push("La cédula no tiene 10 dígitos");
  if (!p.complemento?.trim()) avisos.push("Sin referencia de entrega");
  return avisos;
}
