/**
 * IDs de variante de Shopify conocidos, usados como último recurso cuando la
 * consulta al catálogo falla o el link no trae `?product=`.
 *
 * Por qué existe este archivo: si un item llega a `createShopifyOrder` sin
 * `shopifyVariantId`, Shopify lo registra como línea suelta con el título
 * "Nombre – variante". Esa línea no descuenta inventario, no suma al reporte
 * del producto y no se puede devolver contra el SKU. Entre abril y julio de
 * 2026 eso pasó en 1.083 pedidos con el producto principal.
 *
 * Los IDs de variante son estables ante renombres del producto: la variante
 * 43659069325400 sobrevivió el cambio de "Probiótico vaginal x 60 UND" a
 * "Alimento con probióticos y prebióticos x 60 UND" sin cambiar de número.
 * Por eso resolvemos por ID de variante y no por handle ni por título.
 */
export const VARIANT_IDS = {
  /** Alimento con probióticos y prebióticos x 60 UND — Compra Única / 1 unidad */
  principal: 43659069325400,
  /** Jabón íntimo pH neutro — 200 ml */
  jabon: 43661845299288,
  /** Óvulos FEM x 6 unidades */
  ovulos: 43665049747544,
  /** Gomitas PMS FEM x 60 (Gomitas con fenogreco) */
  gomitas: 43665105748056,
} as const;

/** Precio de lista del producto principal, si Shopify no responde. */
export const PRINCIPAL_FALLBACK_PRICE = 110000;
