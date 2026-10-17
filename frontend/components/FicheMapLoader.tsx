"use client";

import dynamic from "next/dynamic";
import { Batiment } from "@/lib/api";

// Leaflet a besoin de `window` — chargement dynamique sans SSR, même pattern
// que ParcMapLoader.tsx pour la carte de la Vue Parc.
const FicheMap = dynamic(() => import("./FicheMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        color: "#5B6472",
        fontSize: 13,
      }}
    >
      Chargement de la carte…
    </div>
  ),
});

export default function FicheMapLoader({
  latitude,
  longitude,
  nom,
  batiment,
}: {
  latitude: number | null;
  longitude: number | null;
  nom: string;
  batiment?: Batiment;
}) {
  return <FicheMap latitude={latitude} longitude={longitude} nom={nom} batiment={batiment} />;
}
