// ── Auth: prefer static SHOPIFY_ACCESS_TOKEN, fall back to OAuth client_credentials ──
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Static token (custom app) — simplest and most reliable
  if (process.env.SHOPIFY_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ACCESS_TOKEN;
  }

  // OAuth client_credentials flow (fallback)
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(
    `https://${process.env.SHOPIFY_DOMAIN}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.SHOPIFY_CLIENT_ID!,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET!,
      }),
    }
  );
  if (!res.ok) throw new Error(`Shopify token error: ${res.status}`);
  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in - 300) * 1000,
  };
  return tokenCache.token;
}

// ── REST client ────────────────────────────────────────────────────────────────
const API_VERSION = "2024-10";

async function shopifyFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const url = `https://${process.env.SHOPIFY_DOMAIN}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      ...options?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text}`);
  }
  return res.json();
}

// ── GraphQL client ─────────────────────────────────────────────────────────────
async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const token = await getAccessToken();
  const url = `https://${process.env.SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(
      `Shopify GraphQL errors: ${json.errors.map((e) => e.message).join(", ")}`
    );
  }
  return json.data as T;
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  inventory_quantity: number;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  status: string;
  variants: ShopifyVariant[];
  images: { id: number; src: string }[];
}

// ── Product cache (5 min TTL) ──────────────────────────────────────────────────
let productCache: { products: ShopifyProduct[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function getCachedProducts(): Promise<ShopifyProduct[]> {
  const now = Date.now();
  if (productCache && now - productCache.fetchedAt < CACHE_TTL) {
    return productCache.products;
  }
  const products = await getProducts();
  productCache = { products, fetchedAt: now };
  return products;
}

/** Find the first active product whose title matches a pattern */
export async function findProductByTitle(
  pattern: RegExp
): Promise<ShopifyProduct | null> {
  const products = await getCachedProducts();
  return products.find((p) => pattern.test(p.title)) ?? null;
}

// ── Product queries ────────────────────────────────────────────────────────────
export async function getProducts(): Promise<ShopifyProduct[]> {
  const data = await shopifyFetch<{ products: ShopifyProduct[] }>(
    "/products.json?limit=250&status=active"
  );
  return data.products;
}

export async function getProductByHandle(
  handle: string
): Promise<ShopifyProduct | null> {
  // Try exact handle first
  const data = await shopifyFetch<{ products: ShopifyProduct[] }>(
    `/products.json?handle=${encodeURIComponent(handle)}&limit=1`
  );
  if (data.products[0]) return data.products[0];

  // Fallback: search all cached products by handle similarity
  const products = await getCachedProducts();
  return (
    products.find(
      (p) => p.handle === handle || p.handle.includes(handle.replace(/-/g, ""))
    ) ?? null
  );
}

// ── Order creation ─────────────────────────────────────────────────────────────
export interface ShopifyOrderInput {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  complement?: string | null;
  city: string;
  state: string;
  items: Array<{
    name: string;
    variant?: string | null;
    price: number;
    quantity: number;
    shopifyVariantId?: number | null;
  }>;
  shipping: number;
  total: number;
  paymentMethod: "mercadopago" | "contraentrega";
  mpPaymentId?: string | null;
  femOrderId: string;
}

export async function createShopifyOrder(
  input: ShopifyOrderInput
): Promise<number> {
  const isPaid = input.paymentMethod === "mercadopago";
  const gatewayName = isPaid ? "Mercado Pago" : "Contraentrega";

  const orderBody: Record<string, unknown> = {
    email: input.email,
    financial_status: isPaid ? "paid" : "pending",
    currency: "COP",
    suppress_notifications: true,
    payment_gateway_names: [gatewayName],
    line_items: input.items.map((item) => {
      const base: Record<string, unknown> = {
        price: item.price.toFixed(2),
        quantity: item.quantity,
        requires_shipping: true,
      };
      if (item.shopifyVariantId) {
        base.variant_id = item.shopifyVariantId;
      } else {
        base.title = item.variant ? `${item.name} – ${item.variant}` : item.name;
      }
      return base;
    }),
    shipping_address: {
      first_name: input.firstName,
      last_name: input.lastName,
      address1: input.address,
      address2: input.complement ?? "",
      city: input.city,
      province: input.state,
      country_code: "CO",
      phone: `+57${input.phone.replace(/\D/g, "")}`,
    },
    note_attributes: [
      { name: "fem_order_id", value: input.femOrderId },
      { name: "payment_method", value: input.paymentMethod },
      ...(input.mpPaymentId
        ? [{ name: "mp_payment_id", value: input.mpPaymentId }]
        : []),
    ],
    tags: `fem-checkout,${input.paymentMethod}`,
  };

  if (input.shipping > 0) {
    orderBody.shipping_lines = [
      {
        title: "Envío estándar",
        price: input.shipping.toFixed(2),
        code: "standard",
      },
    ];
  }

  if (isPaid) {
    orderBody.transactions = [
      {
        kind: "sale",
        status: "success",
        amount: input.total.toFixed(2),
        gateway: "mercadopago",
      },
    ];
  }

  const result = await shopifyFetch<{
    order: { id: number; order_number: number };
  }>("/orders.json", {
    method: "POST",
    body: JSON.stringify({ order: orderBody }),
  });

  console.log(
    `[Shopify] Orden #${result.order.order_number} creada (ID: ${result.order.id})`
  );
  return result.order.id;
}

// ── Add line item to existing order (Order Editing API — GraphQL) ──────────────
/**
 * Adds a product line item to an existing Shopify order via the Order Editing API.
 * Uses orderEditAddCustomItem to guarantee the exact price regardless of the
 * variant's current Shopify price (important for discounted upsells).
 * Falls back to a plain note if the edit fails.
 */
export async function addLineItemToShopifyOrder(
  shopifyOrderId: number,
  item: {
    name: string;
    variant?: string | null;
    price: number;
    quantity: number;
  }
): Promise<void> {
  const orderId = `gid://shopify/Order/${shopifyOrderId}`;
  const title = item.variant ? `${item.name} – ${item.variant}` : item.name;

  // Step 1: Begin order edit
  const beginData = await shopifyGraphQL<{
    orderEditBegin: {
      calculatedOrder: { id: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation Begin($id: ID!) {
      orderEditBegin(id: $id) {
        calculatedOrder { id }
        userErrors { field message }
      }
    }`,
    { id: orderId }
  );

  const beginErrors = beginData.orderEditBegin.userErrors;
  if (beginErrors.length > 0) {
    throw new Error(`orderEditBegin: ${beginErrors.map((e) => e.message).join(", ")}`);
  }
  const calcId = beginData.orderEditBegin.calculatedOrder?.id;
  if (!calcId) throw new Error("orderEditBegin returned no calculatedOrder");

  // Step 2: Add custom item at the exact upsell price
  const addData = await shopifyGraphQL<{
    orderEditAddCustomItem: {
      calculatedLineItem: { id: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation AddCustom($id: ID!, $title: String!, $price: MoneyInput!, $qty: Int!) {
      orderEditAddCustomItem(id: $id, title: $title, price: $price, quantity: $qty, requiresShipping: true) {
        calculatedLineItem { id }
        userErrors { field message }
      }
    }`,
    {
      id: calcId,
      title,
      price: { amount: item.price.toFixed(2), currencyCode: "COP" },
      qty: item.quantity,
    }
  );

  const addErrors = addData.orderEditAddCustomItem.userErrors;
  if (addErrors.length > 0) {
    throw new Error(`orderEditAddCustomItem: ${addErrors.map((e) => e.message).join(", ")}`);
  }

  // Step 3: Commit the edit
  const commitData = await shopifyGraphQL<{
    orderEditCommit: {
      order: { id: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation Commit($id: ID!, $staffNote: String!) {
      orderEditCommit(id: $id, notifyCustomer: false, staffNote: $staffNote) {
        order { id }
        userErrors { field message }
      }
    }`,
    { id: calcId, staffNote: "Upsell post-compra: jabón añadido desde thank-you page" }
  );

  const commitErrors = commitData.orderEditCommit.userErrors;
  if (commitErrors.length > 0) {
    throw new Error(`orderEditCommit: ${commitErrors.map((e) => e.message).join(", ")}`);
  }

  console.log(`[Shopify] Line item "${title}" añadido a orden ${shopifyOrderId}`);
}

// ── Order notes ────────────────────────────────────────────────────────────────
/** Append a plain text note to an existing Shopify order */
export async function addNoteToShopifyOrder(
  shopifyOrderId: number,
  note: string
): Promise<void> {
  const current = await shopifyFetch<{ order: { note: string | null } }>(
    `/orders/${shopifyOrderId}.json?fields=note`
  );
  const existing = current.order.note ?? "";
  const combined = existing ? `${existing}\n${note}` : note;

  await shopifyFetch(`/orders/${shopifyOrderId}.json`, {
    method: "PUT",
    body: JSON.stringify({ order: { note: combined } }),
  });
}
