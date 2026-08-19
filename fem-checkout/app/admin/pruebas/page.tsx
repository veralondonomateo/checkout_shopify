import PruebasAdminClient from "./PruebasAdminClient";

export const metadata = {
  title: "Pruebas Sendura | FEM Admin",
  robots: { index: false, follow: false },
};

export default function AdminPruebasPage() {
  return <PruebasAdminClient />;
}
