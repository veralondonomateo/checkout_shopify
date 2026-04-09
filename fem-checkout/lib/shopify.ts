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

// ── HTTP client ────────────────────────────────────────────────────────────────
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
  const data = await shopifyFetch<{ products: ShopifyProduct[] }>(
    `/products.json?handle=${encodeURIComponent(handle)}&limit=1`
  );
  return data.products[0] ?? null;
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

  const orderBody: Record<string, unknown> = {
    email: input.email,
    financial_status: isPaid ? "paid" : "pending",
    currency: "COP",
    suppress_notifications: true,
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
    customer: {
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
    },
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
