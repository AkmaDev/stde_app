import Link from "next/link";
import { notFound } from "next/navigation";
import { getBatiment, getBatiments, objectifConso, scoreRisque, scoreUrgence, scoreFaisabilite, prioriteGlobale, priorite } from "@/lib/api";
import { adaptCarac } from "@/lib/caracAdapter";
import { PRIORITE_LABEL, FORME_INSUFFISANTE } from "@/lib/ui";
import FicheBatimentTabs from "@/components/FicheBatimentTabs";

export default async function FicheBatimentPage({ params }: { params: { id: string } }) {
  const detail = await getBatiment(Number(params.id));
  if (!detail) notFound();
  const { batiment, leviers } = detail;
  const batiments = await getBatiments();
  const carac = adaptCarac(batiment);

  // Hélène Berr (9) et Jean-Pierre Melville (16) sont les deux bâtiments
  // retenus comme cas pilotes (voir le rapport de qualité des données) --
  // mis en tête de la liste "Autres bâtiments" uniquement, sans toucher à
  // l'ordre de batiments.json (utilisé par d'autres pages).
  const ORDRE_PILOTES = [9, 16];
  const batimentsTries = [...batiments].sort((a, b) => {
    const ia = ORDRE_PILOTES.indexOf(a.batiment.id);
    const ib = ORDRE_PILOTES.indexOf(b.batiment.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const risque = scoreRisque(batiment);
  const urgence = scoreUrgence(batiment);
  const faisabilite = scoreFaisabilite(batiment);
  const scoreGlobal =
    risque != null && urgence != null && faisabilite != null
      ? Math.round((risque * 0.5 + urgence * 0.3 + faisabilite * 0.2) * 10) / 10
      : null;
  const scoreManquant = [
    risque == null && "Risque",
    urgence == null && "Urgence",
    faisabilite == null && "Faisabilité",
  ].filter((v): v is string => !!v);
  const pg = prioriteGlobale(batiment);
  const objectif2030 = objectifConso(batiment.conso_mesuree_kwh_m2);

  return (
    <>
      <div className="crumb">Ensemble du parc &nbsp;›&nbsp; Fiche bâtiment</div>
      <section style={{ padding: "0 0 48px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, color: "#000091", lineHeight: 1.15 }}>{batiment.nom}</h1>
          <p style={{ margin: 0, fontFamily: "var(--font-serif),Spectral,Georgia,serif", fontStyle: "italic", fontSize: 20, color: "#000091" }}>
            {batiment.adresse ?? `Paris ${batiment.arrondissement} — adresse à vérifier`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn ghost inline">Exporter la fiche</button>
          <button type="button" className="btn inline">Voir les leviers</button>
        </div>
      </section>

      <div className="section-bleed" style={{ background: "#f6f6f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 24 }}>
          <div style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>Consommation constatée</span>
            <span className="num" style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>
              {batiment.conso_mesuree_kwh_m2 ?? "—"} <span style={{ fontSize: 15, fontWeight: 400, color: "#666" }}>kWh/m²·an</span>
            </span>
          </div>
          <div style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>Objectif 2030</span>
            <span className="num" style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>
              {objectif2030 ?? "—"} <span style={{ fontSize: 15, fontWeight: 400, color: "#666" }}>soit −40 %</span>
            </span>
          </div>
          <div
            style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 4 }}
            title={scoreGlobal == null ? `Non calculable : ${scoreManquant.join(" et ")} indisponible (données manquantes pour ce bâtiment).` : undefined}
          >
            <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>Score global</span>
            <span className="num" style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>
              {scoreGlobal ?? "—"} <span style={{ fontSize: 15, fontWeight: 400, color: "#666" }}>/ 100</span>
            </span>
          </div>
          <div style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>Priorité</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>
              {pg != null ? PRIORITE_LABEL[priorite(pg.valeur)] : FORME_INSUFFISANTE + " Données insuffisantes"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "64px 0 112px", display: "flex", gap: "clamp(24px,4vw,64px)", alignItems: "flex-start", flexWrap: "wrap" }}>
        <aside style={{ flex: "1 1 180px", maxWidth: 220, minWidth: 160, display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#161616" }}>Autres bâtiments</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {batimentsTries.map(({ batiment: b }) => {
              const actif = b.id === batiment.id;
              return (
                <Link
                  key={b.id}
                  href={`/batiments/${b.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    borderLeft: `2px solid ${actif ? "#000091" : "transparent"}`,
                    padding: "9px 12px",
                    fontSize: 15,
                    color: actif ? "#000091" : "#3a3a3a",
                    fontWeight: actif ? 500 : 400,
                    textDecoration: "none",
                  }}
                >
                  <span>{b.nom}</span>
                  <span style={{ color: "#888", fontSize: 13, fontWeight: 400 }}>{b.arrondissement}</span>
                </Link>
              );
            })}
          </div>
        </aside>

        <div style={{ flex: "999 1 480px", minWidth: 0 }}>
          <FicheBatimentTabs
            carac={carac}
            leviers={leviers}
            documents={batiment.documents}
            latitude={batiment.latitude}
            longitude={batiment.longitude}
            nom={batiment.nom}
            batiment={batiment}
          />
        </div>
      </div>
    </>
  );
}
