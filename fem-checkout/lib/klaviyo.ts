import { OrderItem } from "@/types/checkout";
import { whenAvailable } from "@/lib/pixels";

// Klaviyo onsite tracking helper.
//
// The onsite script (loaded in app/layout.tsx) exposes a global `klaviyo`
// object with `.identify(properties, callback)` and `.track(event, properties)`.
// We use it to fire a "Started Checkout" event as soon as the shopper types a
// valid email — this checkout is a custom Next.js app, not Shopify-hosted, so
// Klaviyo never receives Shopify's built-in "Checkout Started" event.
//
// Docs:
// - https://developers.klaviyo.com/en/docs/javascript_api
// - https://developers.klaviyo.com/en/docs/guide_to_integrating_a_platform_without_a_pre_built_klaviyo_integration

// The event name is EXACT and intentionally distinct from Shopify's
// "Checkout Started" metric so the two stay separable in Klaviyo.
const STARTED_CHECKOUT_EVENT = "Started Checkout";

interface KlaviyoGlobal {
  identify: (properties: Record<string, unknown>, callback?: () => void) => void;
  track: (event: string, properties?: Record<string, unknown>) => void;
}

function getKlaviyo(): KlaviyoGlobal | null {
  if (typeof window === "undefined") return null;
  const k = (window as unknown as { klaviyo?: KlaviyoGlobal }).klaviyo;
  return k && typeof k.identify === "function" ? k : null;
}

// Format a Colombian number to E.164 (+57...). Returns undefined when the value
// doesn't look like a valid 10-digit local number, so we can omit it.
function toE164(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) return `+57${digits}`;
  if (/^57\d{10}$/.test(digits)) return `+${digits}`;
  return undefined;
}

// A stable per-cart/session id so $event_id is unique and the flag survives
// re-renders. Reused across identify re-runs within the same session.
function getCartId(): string {
  const KEY = "fem-klaviyo-cart-id";
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const id = `cart_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return `cart_${Date.now()}`;
  }
}

function alreadyTracked(cartId: string): boolean {
  try {
    return sessionStorage.getItem(`fem-klaviyo-started-${cartId}`) === "1";
  } catch {
    return false;
  }
}

function markTracked(cartId: string): void {
  try {
    sessionStorage.setItem(`fem-klaviyo-started-${cartId}`, "1");
  } catch {
    /* ignore */
  }
}

interface StartedCheckoutInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  items: OrderItem[];
  total: number;
}

/**
 * Identify the profile and fire "Started Checkout" in Klaviyo.
 *
 * - identify runs every time (so a corrected email updates the profile),
 * - the track fires only once per cart/session.
 */
export function trackStartedCheckout({
  email,
  firstName,
  lastName,
  phone,
  items,
  total,
}: StartedCheckoutInput): void {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return;

  // Only include fields that are actually filled; email is the only required one.
  const identity: Record<string, unknown> = { email: trimmedEmail };
  if (firstName?.trim()) identity.first_name = firstName.trim();
  if (lastName?.trim()) identity.last_name = lastName.trim();
  const phoneNumber = toE164(phone);
  if (phoneNumber) identity.phone_number = phoneNumber;

  const cartId = getCartId();

  const runTrack = (klaviyo: KlaviyoGlobal) => {
    if (alreadyTracked(cartId)) return;
    markTracked(cartId);

    const payload = {
      $event_id: `${cartId}_${Date.now()}`,
      $value: total,
      ItemNames: items.map((i) => i.name),
      CheckoutURL: window.location.href,
      Items: items.map((i) => ({
        ProductID: i.id,
        ProductName: i.name,
        Quantity: i.quantity,
        ItemPrice: i.price,
        RowTotal: i.price * i.quantity,
        ImageURL: i.image,
      })),
    };

    klaviyo.track(STARTED_CHECKOUT_EVENT, payload);
  };

  // klaviyo.js carga diferido (ver app/layout.tsx). El proxy buffer que se
  // instala en el <head> hace que window.klaviyo exista desde el primer
  // momento y encole las llamadas hasta que el script real llegue, así que
  // esto normalmente resuelve de inmediato; la espera queda como red de
  // seguridad por si el proxy no llegó a instalarse.
  whenAvailable<KlaviyoGlobal>(
    () => getKlaviyo(),
    (klaviyo) => {
      // identify accepts a callback as its second argument; track after it resolves.
      klaviyo.identify(identity, () => runTrack(klaviyo));
    }
  );
}
