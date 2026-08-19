import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/** Registro de los pedidos del entorno de pruebas de Sendura. */
export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pruebas_sendura")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[Admin/Pruebas] Error leyendo pruebas:", error);
    return NextResponse.json({ error: "Error de base de datos" }, { status: 500 });
  }

  return NextResponse.json({ pruebas: data ?? [] });
}
