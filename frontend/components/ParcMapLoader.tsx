"use client";

import dynamic from "next/dynamic";
import { Batiment } from "@/lib/api";

// Leaflet a besoin de `window` — chargement dynamique sans SSR obligatoire,
// et ce fichier doit rester un Client Component pour que ssr:false soit autorisé.
const ParcMap = dynamic(() => import("./ParcMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "#5B6472",
        fontSize: 13,
      }}
    >
      Chargement de la carte…
    </div>
  ),
});

export default function ParcMapLoader({
  buildings,
}: {
  buildings: { batiment: Batiment }[];
}) {
  return <ParcMap buildings={buildings} />;
}
