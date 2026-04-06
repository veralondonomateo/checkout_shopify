import { NextRequest, NextResponse } from "next/server";
import MercadoPagoConfig, { Preference } from "mercadopago";
import { OrderItem } from "@/types/checkout";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

interface CheckoutBody {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  state: string;
  city: string;
  paymentMethod: "mercadopago" | "contraentrega";
  items: OrderItem[];
  total: number;
  couponCode?: string;
  discount?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: CheckoutBody = await req.json();

    // Contra entrega: no MP payment needed
    if (body.paymentMethod === "contraentrega") {
      return NextResponse.json({ type: "contraentrega", status: "pending" });
    }

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: body.items.map((item) => ({
          id: item.id,
          title: item.variant ? `${item.name} – ${item.variant}` : item.name,
          quantity: item.quantity,
          unit_price: item.price,
          currency_id: "COP",
          picture_url: item.image,
        })),
        payer: {
          name: body.firstName,
          surname: body.lastName,
          email: body.email,
          phone: { number: body.phone },
          address: {
            street_name: body.address,
            zip_code: "",
          },
        },
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://checkoutshopify.vercel.app"}/checkout?status=success`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://checkoutshopify.vercel.app"}/checkout?status=failure`,
          pending: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://checkoutshopify.vercel.app"}/checkout?status=pending`,
        },
        auto_return: "approved",
        statement_descriptor: "FEM SUPLEMENTOS",
        ...(body.couponCode && body.discount && body.discount > 0
          ? {
              discounts: [
                {
                  name: body.couponCode,
                  amount: body.discount,
                },
              ],
            }
          : {}),
      },
    });

    return NextResponse.json({
      type: "mercadopago",
      init_point: result.sandbox_init_point ?? result.init_point,
      preference_id: result.id,
    });
  } catch (err) {
    console.error("MP checkout error:", err);
    return NextResponse.json(
      { error: "Error creando la orden de pago" },
      { status: 500 }
    );
  }
}
