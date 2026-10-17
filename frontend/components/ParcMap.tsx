"use client";

// Carte du parc -- portage du composant de référence du handoff design
// (design_handoff_sdte/src/MapParc.tsx), adapté aux vraies données de l'app
// (lib/api.ts) au lieu du jeu de données fictif du prototype (sdte-data.js).
// Choroplèthe arrondissements (pas de fond IGN/OSM ici, cf. CLAUDE.md du handoff) :
// rose #fde4e1 sur bleu pâle #c9d8f6, recherche flottante, mini-fiche au clic,
// sélecteur de mode (priorité / consommation / écart 2030), légende.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useRouter } from "next/navigation";
import { Batiment, priorite, prioriteGlobale, ecartKwhM2 } from "@/lib/api";
import { PRIORITE_HEX, PRIORITE_LABEL } from "@/lib/ui";

// Fonds de carte IGN Géoplateforme -- toujours exportés pour FicheMap.tsx
// (plan cadastral d'un bâtiment, onglet distinct, non concerné par ce redesign).
export const IGN_WMTS_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM" +
  "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";
export const IGN_ORTHO_WMTS_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM" +
  "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg";
export const IGN_CADASTRE_WMTS_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
  "&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&TILEMATRIXSET=PM" +
  "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png";

type Mode = "prio" | "conso" | "gap";
type B = { batiment: Batiment };

const floatBtn: React.CSSProperties = { width: 40, height: 40, border: 0, boxShadow: "0 2px 6px rgba(0,0,18,.16)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 };
const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

const CONSO_BINS: [number, string][] = [[130, "#c3cdf5"], [200, "#8b9cf0"], [300, "#4a5bd6"], [Infinity, "#000091"]];
const niveauDe = (b: Batiment) => {
  const pg = prioriteGlobale(b);
  return pg == null ? null : priorite(pg.valeur);
};
const dotColor = (niveau: "elevee" | "moyenne" | "faible" | null) =>
  niveau === "elevee" ? "#c9633f" : niveau === "moyenne" ? "#c8a03a" : "#ccc";
const colorFor = (b: Batiment, mode: Mode) => {
  const conso = b.conso_mesuree_kwh_m2;
  if (conso == null) return "#fff";
  if (mode === "conso") return CONSO_BINS.find(([t]) => conso < t)![1];
  if (mode === "gap") {
    const g = ecartKwhM2(b);
    if (g == null) return "#fff";
    return g <= 0 ? "#27794a" : g < 30 ? "#c8a03a" : g < 70 ? "#e0805a" : "#b5402a";
  }
  const niveau = niveauDe(b);
  return niveau ? PRIORITE_HEX[niveau] : "#fff";
};
const LEGENDS: Record<Mode, [string, [string, string][]]> = {
  prio: ["Priorité de rénovation", [["#c9633f", "Élevée"], ["#c8a03a", "Moyenne"]]],
  conso: ["Consommation (kWh/m²·an)", [["#c3cdf5", "< 130"], ["#8b9cf0", "130 – 200"], ["#4a5bd6", "200 – 300"], ["#000091", "> 300"]]],
  gap: ["Écart à l'objectif 2030 (propre à chaque bâtiment)", [["#27794a", "Objectif atteint"], ["#c8a03a", "< 30 kWh/m²"], ["#e0805a", "30 à 70 kWh/m²"], ["#b5402a", "> 70 kWh/m²"]]],
};
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const gapStr = (b: Batiment) => {
  const g = ecartKwhM2(b);
  if (g == null) return "—";
  return (g > 0 ? "+" : "") + g + " kWh/m²";
};
// Pas de surbrillance de l'arrondissement entier au clic : sur de vrais
// arrondissements parisiens (bien plus grands/irréguliers que le découpage
// fictif du mockup), ça teinte une zone énorme et distrait du marqueur. La
// sélection reste visible via l'anneau bleu du marqueur (cf. restyle()).
const arrStyle = () => ({ fillColor: "#fde4e1", fillOpacity: 1, color: "#fff", weight: 1.5 });

export default function ParcMap({ buildings }: { buildings: B[] }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const arrRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<{ b: B; mk: L.CircleMarker }[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("prio");
  const [query, setQuery] = useState("");

  const geolocalises = buildings.filter((b) => b.batiment.latitude != null && b.batiment.longitude != null);

  useEffect(() => {
    const m = L.map(elRef.current!, { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true })
      .fitBounds([[48.815, 2.225], [48.902, 2.47]]);
    m.attributionControl.setPrefix("");
    mapRef.current = m;
    fetch("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/exports/geojson")
      .then((r) => { if (!r.ok) throw 0; return r.json(); })
      .then((g) => {
        if (mapRef.current !== m) return;
        arrRef.current = L.geoJSON(g, { style: arrStyle, interactive: false }).addTo(m);
        arrRef.current.bringToBack();
        m.fitBounds(arrRef.current.getBounds(), { padding: [24, 24] });
        m.attributionControl.addAttribution("Arrondissements © Ville de Paris");
        restyle();
      })
      .catch(() => {
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", { attribution: "© OpenStreetMap · © CARTO", opacity: 0.7 }).addTo(m);
      });
    markersRef.current = geolocalises.map((b) => {
      const mk = L.circleMarker([b.batiment.latitude as number, b.batiment.longitude as number], { radius: 9, weight: 2, fillOpacity: 1 }).addTo(m);
      mk.bindTooltip(b.batiment.nom, { direction: "top", offset: [0, -10] });
      mk.on("click", () => setSel(b.batiment.id));
      return { b, mk };
    });
    setTimeout(() => m.invalidateSize(), 100);
    const fs = () => setTimeout(() => m.invalidateSize(), 150);
    document.addEventListener("fullscreenchange", fs);
    return () => { document.removeEventListener("fullscreenchange", fs); m.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restyle() {
    markersRef.current.forEach(({ b, mk }) => {
      const on = b.batiment.id === sel;
      mk.setStyle({
        fillColor: colorFor(b.batiment, mode),
        color: on ? "#000091" : b.batiment.conso_mesuree_kwh_m2 != null ? "#fff" : "#8a8a8a",
        weight: on ? 3 : 2,
        radius: on ? 12 : b.batiment.conso_mesuree_kwh_m2 != null ? 9 : 7,
      } as any);
      if (on) mk.bringToFront();
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(restyle, [sel, mode]);

  function pick(id: number) {
    setSel(id);
    setQuery("");
    const b = buildings.find((x) => x.batiment.id === id);
    if (mapRef.current && b?.batiment.latitude != null && b?.batiment.longitude != null) {
      mapRef.current.flyTo([b.batiment.latitude, b.batiment.longitude], 14.5, { duration: 0.6 });
    }
  }

  const q = norm(query.trim());
  const results = q ? buildings.filter((x) => norm(x.batiment.nom).includes(q)).slice(0, 5) : [];
  const sb = buildings.find((x) => x.batiment.id === sel);
  const sbNiveau = sb ? niveauDe(sb.batiment) : null;
  const [lt, li] = LEGENDS[mode];
  const legend = [...li.map(([c, label]) => ({ c, label, bd: "#fff" })), { c: "#fff", label: "Non documenté", bd: "#8a8a8a" }];
  const modeBtn = (k: Mode) => ({ ...floatBtn, background: mode === k ? "#000091" : "#fff", color: mode === k ? "#fff" : "#000091" });

  return (
    <div ref={wrapRef} style={{ position: "relative", height: "100%", width: "100%", background: "#c9d8f6", overflow: "hidden" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0, background: "#c9d8f6" }} />

      {/* Recherche flottante */}
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 500, width: 280, maxWidth: "calc(100% - 96px)", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,18,.16)", padding: "0 12px", height: 40, color: "#000091" }}>
          <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) pick(results[0].batiment.id); }}
            placeholder="Rechercher un bâtiment"
            style={{ border: 0, outline: "none", flex: 1, minWidth: 0, background: "none", fontSize: 14, color: "#161616" }}
          />
        </div>
        {results.length > 0 && (
          <div style={{ background: "#fff", boxShadow: "0 4px 12px rgba(0,0,18,.16)", display: "flex", flexDirection: "column", padding: "4px 0" }}>
            {results.map(({ batiment }) => (
              <button
                key={batiment.id}
                type="button"
                onClick={() => pick(batiment.id)}
                style={{ background: "none", border: 0, padding: "10px 14px", textAlign: "left", fontSize: 14, color: "#161616", display: "flex", justifyContent: "space-between", gap: 8, cursor: "pointer" }}
              >
                <span>{batiment.nom}</span><span style={{ color: "#888" }}>{batiment.arrondissement}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mini-fiche */}
      {sb && (
        <div style={{ position: "absolute", top: 16, right: 72, zIndex: 500, width: 300, maxWidth: "calc(100% - 104px)", background: "#fff", boxShadow: "0 4px 14px rgba(0,0,18,.16)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "#161616" }}>{sb.batiment.nom}</span>
              <span style={{ fontSize: 13, color: "#666" }}>Paris {sb.batiment.arrondissement}</span>
            </div>
            <button onClick={() => setSel(null)} title="Fermer" style={{ background: "none", border: 0, color: "#666", fontSize: 18, lineHeight: 1, cursor: "pointer", padding: 2 }}>×</button>
          </div>
          {sb.batiment.conso_mesuree_kwh_m2 != null ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, borderTop: "1px solid #eee", paddingTop: 12 }}>
                <span className="num" style={{ fontSize: 24, fontWeight: 800, color: "#161616" }}>{sb.batiment.conso_mesuree_kwh_m2} <span style={{ fontSize: 13, fontWeight: 400, color: "#666" }}>kWh/m²·an</span></span>
                <span className="num" style={{ fontSize: 14, color: "#3a3a3a" }}>{gapStr(sb.batiment)} vs 2030</span>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#3a3a3a" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(sbNiveau) }} />
                {sbNiveau ? `Priorité ${PRIORITE_LABEL[sbNiveau].toLowerCase()}` : "Priorité non calculable"}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 14, color: "#666", borderTop: "1px solid #eee", paddingTop: 12 }}>Bâtiment non encore documenté.</span>
          )}
          <a href="#" onClick={(e) => { e.preventDefault(); router.push(`/batiments/${sb.batiment.id}`); }} style={{ fontSize: 14, fontWeight: 500 }}>Voir la fiche bâtiment</a>
        </div>
      )}

      {/* Modes + zoom */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 500, display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={() => setMode("prio")} title="Priorité de rénovation" style={modeBtn("prio")}><Icon d="M5 21V4h12l-2.5 4L17 12H5" /></button>
        <button onClick={() => setMode("conso")} title="Consommation mesurée" style={modeBtn("conso")}><Icon d="M13 2 4 14h7l-1 8 9-12h-7z" /></button>
        <button onClick={() => setMode("gap")} title="Écart à l'objectif 2030" style={modeBtn("gap")}><Icon d="M3 17l6-6 4 4 8-8M15 7h6v6" /></button>
        <span style={{ height: 8 }} />
        <button onClick={() => mapRef.current?.zoomIn()} title="Zoom avant" style={{ ...floatBtn, background: "#fff", color: "#000091" }}><Icon d="M12 5v14M5 12h14" /></button>
        <button onClick={() => mapRef.current?.zoomOut()} title="Zoom arrière" style={{ ...floatBtn, background: "#fff", color: "#000091" }}><Icon d="M5 12h14" /></button>
      </div>
      <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 500 }}>
        <button onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else wrapRef.current?.requestFullscreen?.(); }} title="Plein écran" style={{ ...floatBtn, background: "#fff", color: "#000091" }}><Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></button>
      </div>

      {/* Légende */}
      <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 500, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,18,.16)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "#3a3a3a" }}>
        <span style={{ fontWeight: 700, color: "#161616" }}>{lt}</span>
        {legend.map((lg) => (
          <span key={lg.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: lg.c, border: `1.5px solid ${lg.bd}` }} />
            {lg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
