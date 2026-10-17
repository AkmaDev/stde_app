"use client";

import { useState } from "react";
import Link from "next/link";
import { Batiment, prioriteGlobale, priorite } from "@/lib/api";
import { PRIORITE_LABEL, PRIORITE_HEX } from "@/lib/ui";

const ecartStr = (kwh: number) => `${kwh > 0 ? "+" : ""}${Math.round(kwh)} kWh/m²`;

type Tri = "Consommation" | "Nom" | "Arrondissement";

export default function TableauBatiments({
  documentes,
  ecartParId,
}: {
  documentes: { batiment: Batiment }[];
  ecartParId: Record<number, number>;
}) {
  const [tri, setTri] = useState<Tri>("Consommation");

  const lignes = [...documentes].sort((a, b) => {
    if (tri === "Nom") return a.batiment.nom.localeCompare(b.batiment.nom);
    if (tri === "Arrondissement") return parseInt(a.batiment.arrondissement) - parseInt(b.batiment.arrondissement);
    return (b.batiment.conso_mesuree_kwh_m2 ?? 0) - (a.batiment.conso_mesuree_kwh_m2 ?? 0);
  });

  return (
    <div id="tableau-batiments" style={{ background: "#fff", padding: "96px 32px 112px", display: "flex", flexDirection: "column", gap: 32, scrollMarginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#161616" }}>Bâtiments documentés</h2>
          <p style={{ margin: 0, fontSize: 17 }}>Classés par {tri === "Consommation" ? "consommation mesurée" : tri === "Nom" ? "nom" : "arrondissement"}.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["Consommation", "Nom", "Arrondissement"] as const).map((t) => (
            <button key={t} type="button" className={`pill-toggle${tri === t ? " on" : ""}`} onClick={() => setTri(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,2fr) minmax(0,1fr)", gap: 24, padding: "0 0 12px", borderBottom: "1px solid #ddd", fontSize: 14, color: "#666" }}>
          <span>Bâtiment</span>
          <span>Arrondissement</span>
          <span>Consommation</span>
          <span>Écart à l&apos;objectif 2030</span>
          <span>Priorité</span>
        </div>
        {lignes.map(({ batiment }) => {
          const pg = prioriteGlobale(batiment);
          const ecart_kwh_m2 = ecartParId[batiment.id];
          const barW = Math.min(100, Math.max(3, Math.abs(ecart_kwh_m2)));
          return (
            <Link
              key={batiment.id}
              href={`/batiments/${batiment.id}`}
              className="table-row-hover"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,2fr) minmax(0,1fr)",
                gap: 24,
                alignItems: "center",
                padding: "20px 0",
                borderBottom: "1px solid #eee",
                fontSize: 16,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span style={{ color: "#000091", fontWeight: 500 }}>{batiment.nom}</span>
              <span>Paris {batiment.arrondissement}</span>
              <span className="num" style={{ color: "#161616" }}>
                {batiment.conso_mesuree_kwh_m2} <span style={{ fontSize: 13, color: "#888" }}>kWh/m²·an</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, height: 4, background: "#eee", borderRadius: 2, overflow: "hidden", position: "relative", maxWidth: 140 }}>
                  <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${barW}%`, background: ecart_kwh_m2 > 0 ? "#c9633f" : "#27794a" }} />
                </span>
                <span className="num" style={{ fontSize: 14, minWidth: 60, whiteSpace: "nowrap", textAlign: "right" }}>{ecartStr(ecart_kwh_m2)}</span>
              </span>
              {pg != null ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITE_HEX[priorite(pg.valeur)] }} />
                  {PRIORITE_LABEL[priorite(pg.valeur)]}
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ccc" }} />
                  Données insuffisantes
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 15 }}>
        {165 - documentes.length} bâtiments restent à documenter.{" "}
        <span
          title="Pas encore disponible — les corrections de données passent aujourd'hui par le bouton « Modifier » de chaque champ, sur la fiche d'un bâtiment."
          style={{ color: "#999", cursor: "not-allowed" }}
        >
          Importer des documents
        </span>
      </p>
    </div>
  );
}
