"use client";

import "leaflet/dist/leaflet.css";
import type L from "leaflet";
import { useRef, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { IGN_CADASTRE_WMTS_URL, IGN_ORTHO_WMTS_URL, IGN_WMTS_URL } from "./ParcMap";
import { Batiment, reconstruitContour, aireEtPerimetreContour } from "@/lib/api";

const ctlBtn: React.CSSProperties = { width: 40, height: 40, background: "#fff", color: "#000091", boxShadow: "0 2px 6px rgba(0,0,18,.16)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, border: 0, cursor: "pointer", padding: 0 };

// Carte centrée/zoomée sur un bâtiment précis, cadastre actif par défaut --
// pour identifier visuellement son emprise.
export default function FicheMap({
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
  const mapRef = useRef<L.Map | null>(null);
  const [layer, setLayer] = useState<"plan" | "photo">("plan");

  if (latitude == null || longitude == null) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", width: "100%", color: "#666", fontSize: 13 }}>
        Coordonnées non disponibles pour ce bâtiment.
      </div>
    );
  }

  const center: [number, number] = [latitude, longitude];
  const contour = batiment ? reconstruitContour(batiment) : null;
  const emprise = contour ? aireEtPerimetreContour(contour) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Plan cadastral</h2>
        <p style={{ margin: 0, fontSize: 16 }}>Parcelle et emprise du bâtiment sur le plan cadastral IGN.</p>
      </div>

      <div style={{ position: "relative", height: 480 }}>
        <MapContainer ref={mapRef} center={center} zoom={19} zoomControl={false} style={{ width: "100%", height: "100%" }} scrollWheelZoom={true}>
          <TileLayer url={layer === "plan" ? IGN_WMTS_URL : IGN_ORTHO_WMTS_URL} attribution='&copy; <a href="https://www.geoportail.gouv.fr/">IGN-F/Géoportail</a>' maxZoom={19} />
          <TileLayer url={IGN_CADASTRE_WMTS_URL} attribution="" maxZoom={19} />
          <CircleMarker center={center} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#000091", fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -6]}>{nom}</Tooltip>
          </CircleMarker>
        </MapContainer>
        <div style={{ position: "absolute", top: 16, left: 16, display: "flex", boxShadow: "0 2px 6px rgba(0,0,18,.16)", zIndex: 500 }}>
          {(["plan", "photo"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              style={{ background: layer === l ? "#000091" : "#fff", color: layer === l ? "#fff" : "#000091", padding: "8px 14px", fontSize: 14, border: 0, cursor: "pointer" }}
            >
              {l === "plan" ? "Plan" : "Photo aérienne"}
            </button>
          ))}
        </div>
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 2, zIndex: 500 }}>
          <button style={ctlBtn} onClick={() => mapRef.current?.zoomIn()}>+</button>
          <button style={ctlBtn} onClick={() => mapRef.current?.zoomOut()}>−</button>
        </div>
      </div>

      {emprise && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "24px 32px", borderTop: "1px solid #ddd", paddingTop: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "#666" }}>Emprise bâtie</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 500, color: "#161616" }}>{Math.round(emprise.area)} m²</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "#666" }}>Périmètre</span>
            <span className="num" style={{ fontSize: 16, fontWeight: 500, color: "#161616" }}>{emprise.perimetre.toFixed(1)} m</span>
          </div>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 14, color: "#666", maxWidth: 720 }}>
        Source : IGN — Parcellaire Express (PCI), fond de plan Géoportail.
        {!emprise && " Emprise et périmètre non disponibles : géométrie de ce bâtiment pas encore vérifiée."}
      </p>
    </div>
  );
}
