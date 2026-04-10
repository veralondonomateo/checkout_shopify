import { createHash } from "crypto";

const PIXEL_ID = process.env.META_PIXEL_ID!;
const ACCESS_TOKEN = process.env.META_CONVERSIONS_TOKEN!;
const API_VERSION = "v19.0";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function hashPhone(phone: string): string {
  // Normalize to E.164 without '+': 573001234567
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("57") ? digits : `57${digits}`;
  return createHash("sha256").update(normalized).digest("hex");
}

interface PurchaseEventInput {
  orderId: string;
  email: string;
  phone?: string;
  value: number;         // COP
  currency?: string;
  eventSourceUrl?: string;
  clientIp?: string;
  clientUserAgent?: string;
  fbp?: string;          // _fbp cookie
  fbc?: string;          // _fbc cookie
}

export async function sendPurchaseEvent(input: PurchaseEventInput): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.warn("[Meta CAPI] Missing META_PIXEL_ID or META_CONVERSIONS_TOKEN — skipping");
    return;
  }

  const userData: Record<string, unknown> = {
    em: [sha256(input.email)],
  };
  if (input.phone) userData.ph = [hashPhone(input.phone)];
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: input.eventSourceUrl ?? "https://checkoutfem.com/checkout",
        event_id: `purchase_${input.orderId}`, // dedup con pixel browser
        user_data: userData,
        custom_data: {
          currency: input.currency ?? "COP",
          value: input.value,
          order_id: input.orderId,
        },
      },
    ],
    access_token: ACCESS_TOKEN,
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[Meta CAPI] Error:", text);
    } else {
      console.log(`[Meta CAPI] Purchase event sent for order ${input.orderId}`);
    }
  } catch (err) {
    // No-fatal: nunca bloquear el flujo de pago por un error de tracking
    console.error("[Meta CAPI] Fetch error:", err);
  }
}
