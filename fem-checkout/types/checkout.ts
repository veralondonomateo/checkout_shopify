export interface CheckoutFormData {
  email: string;
  firstName: string;
  lastName: string;
  cedula?: string;
  address: string;
  complement?: string;
  state: string;
  city: string;
  phone: string;
  paymentMethod: "mercadopago" | "contraentrega";
  saveInfo?: boolean;
}

export interface StateData {
  id: number;
  id_country: number;
  name: string;
  cities: string[];
}

export interface StatesJson {
  states: StateData[];
}

export interface OrderItem {
  id: string;
  name: string;
  variant?: string;
  price: number;
  quantity: number;
  image: string;
  /** Shopify variant ID — used for proper inventory/product linking in orders */
  shopifyVariantId?: number;
}

export interface OrderSummaryProps {
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  discountCode?: string;
}

export type CheckoutStep = "contact" | "delivery" | "payment" | "confirmation";
