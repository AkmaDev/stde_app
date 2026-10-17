import Link from "next/link";
import { getIndicateurs, objectifConso } from "@/lib/api";

export default async function IndicateursPage() {
  const data = await getIndicateurs();
  const rows = data.classement_ecart_objectif;
  const MAX = 420;

  const kpis: [string, string, string, string][] = [
    ["Consommation moyenne", `${data.conso_moyenne_ponderee_kwh_m2.toLocaleString("fr-FR")}`, "kWh/m²·an", "Pondérée par la surface"],
    ["Écart à l'objectif 2030", `+${data.ecart_moyen_objectif_2030_kwh_m2.toLocaleString("fr-FR")}`, "kWh/m²·an", "En moyenne · objectif propre à chaque bâtiment, −40 %"],
    ["Bâtiments qualifiés", `${data.nb_batiments_qualifies_3_leviers}`, `sur ${data.nb_batiments_documentes}`, "Au moins 3 leviers applicables"],
    ["Gain indicatif moyen", `−${data.gain_potentiel_moyen_pct.toLocaleString("fr-FR")} %`, "", "Leviers applicables, écrêté"],
  ];

  return (
    <>
      <div className="crumb">Accueil &nbsp;›&nbsp; Indicateurs globaux</div>
      <section style={{ padding: "0 0 48px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, color: "#000091", lineHeight: 1.15 }}>Indicateurs globaux</h1>
          <p style={{ margin: 0, fontFamily: "var(--font-serif),Spectral,Georgia,serif", fontStyle: "italic", fontSize: 20, color: "#000091" }}>
            Périmètre test — {data.nb_batiments_documentes} bâtiments documentés
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 14, color: "#666" }}>Référentiel</span>
          <span className="pill-toggle on" style={{ cursor: "default" }}>Décret tertiaire</span>
        </div>
      </section>

      <div className="section-bleed" style={{ background: "#f6f6f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 24 }}>
          {kpis.map(([l, v, u, s]) => (
            <div key={l} style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>{l}</span>
              <span className="num" style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>
                {v} {u && <span style={{ fontSize: 15, fontWeight: 400, color: "#666" }}>{u}</span>}
              </span>
              <span style={{ fontSize: 14, color: "#666" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      <section style={{ padding: "96px 0 112px", display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
          <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#161616" }}>Écart à l&apos;objectif 2030</h2>
          <p style={{ margin: 0, fontSize: 17 }}>Du plus éloigné au plus proche. Le trait vertical marque l&apos;objectif propre à chaque bâtiment (−40 % de sa consommation mesurée).</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1.5fr) minmax(0,.8fr) minmax(0,1.2fr) minmax(0,2fr) minmax(0,1.5fr)",
              gap: 24,
              padding: "0 0 12px",
              borderBottom: "1px solid #ddd",
              fontSize: 14,
              color: "#666",
              minWidth: 760,
            }}
          >
            <span>Bâtiment</span>
            <span>Arr.</span>
            <span>Consommation</span>
            <span>Écart à l&apos;objectif</span>
            <span>Statut patrimonial</span>
          </div>
          {rows.map(({ batiment, ecart_kwh_m2 }) => (
            <Link
              key={batiment.id}
              href={`/batiments/${batiment.id}`}
              className="table-row-hover"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.5fr) minmax(0,.8fr) minmax(0,1.2fr) minmax(0,2fr) minmax(0,1.5fr)",
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
              <span className="num" style={{ color: "#161616", whiteSpace: "nowrap" }}>
                {batiment.conso_mesuree_kwh_m2} <span style={{ fontSize: 13, color: "#888" }}>kWh/m²·an</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1, height: 8, background: "#eee", position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, ((batiment.conso_mesuree_kwh_m2 ?? 0) / MAX) * 100)}%`, background: "#000091" }} />
                  <span style={{ position: "absolute", left: `${((objectifConso(batiment.conso_mesuree_kwh_m2) ?? 0) / MAX) * 100}%`, top: -5, bottom: -5, width: 2, background: "#161616" }} />
                </span>
                <span className="num" style={{ fontSize: 15, minWidth: 64, textAlign: "right", color: "#161616", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {ecart_kwh_m2 > 0 ? "+" : ""}
                  {Math.round(ecart_kwh_m2)} kWh/m²
                </span>
              </span>
              <span style={{ fontSize: 15, color: batiment.statut_patrimonial !== "Aucune contrainte" ? "#161616" : "#666" }}>{batiment.statut_patrimonial}</span>
            </Link>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "#666", maxWidth: 720 }}>
          Énergie finale, surface de référence OPERAT. Consommations mesurées : moyenne glissante sur les années calendaires complètes 2023-2025, quand les factures le permettent. Les bâtiments non documentés sont exclus du calcul.{" "}
          <Link href="/etat-du-projet" style={{ color: "#000091" }}>Méthode de calcul</Link>
        </p>
      </section>
    </>
  );
}
