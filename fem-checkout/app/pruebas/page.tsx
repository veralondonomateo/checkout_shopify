import PruebasClient from "./PruebasClient";

export const metadata = {
  title: "Pruebas Sendura | FEM",
  // No queremos este checkout en buscadores ni en previews compartidos.
  robots: { index: false, follow: false },
};

export default function PruebasPage() {
  return <PruebasClient />;
}
