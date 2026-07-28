import Link from "next/link";
import TopTabs from "@/components/TopTabs";
import { getBatiments, priorite } from "@/lib/api";
import { PRIORITE_DOT, PRIORITE_LABEL } from "@/lib/ui";

export default async function VueParcPage() {
  const batiments = await getBatiments();
  const documentes = batiments.filter((b) => b.batiment.conso_mesuree_kwh_m2 != null);
  const classes = [...documentes].sort((a, b) => b.score.sct - a.score.sct);
  const prioritaire = classes[0];

  return (
    <>
      <div className="crumb">Vue d&apos;ensemble</div>
      <div className="h1">
        Ensemble du parc <small>{documentes.length} bâtiments documentés sur 165</small>
      </div>
      <div className="panel">
        <TopTabs />
        <div className="subtabs">
          <div className="chip on">Priorité globale</div>
          <div className="chip">Écart objectif 2030</div>
          <div className="chip">Risque de surchauffe</div>
        </div>
        <div className="content" style={{ display: "flex", gap: 18 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {classes.map(({ batiment, score }) => (
              <Link
                key={batiment.id}
                href={`/batiments/${batiment.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  border: "1px solid #E1E9EC",
                  borderRadius: 7,
                  background: "#fff",
                  textDecoration: "none",
                  color: "#2B3D46",
                  fontSize: 13,
                }}
              >
                <span className={`dot ${PRIORITE_DOT[priorite(score.sct)]}`}></span>
                <b>{batiment.nom}</b>
                <span className="mut">{batiment.arrondissement}</span>
                <span className="mut" style={{ marginLeft: "auto" }}>
                  {batiment.conso_mesuree_kwh_m2} kWh/m²·an
                </span>
                <span className="state s-app">{PRIORITE_LABEL[priorite(score.sct)]}</span>
              </Link>
            ))}
          </div>
          {prioritaire && (
            <div style={{ width: 340, border: "1px solid #DCE5E9", borderRadius: 6, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #EDF1F3" }}>
                <div style={{ fontSize: 10.5, letterSpacing: 1, color: "#8A9AA3" }}>PRIORITÉ LA PLUS ÉLEVÉE</div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{prioritaire.batiment.nom}</div>
                <div style={{ fontSize: 12, color: "#7A8D97", marginTop: 2 }}>
                  Paris {prioritaire.batiment.arrondissement}
                </div>
              </div>
              <div style={{ padding: "14px 16px", fontSize: 12.5, lineHeight: 2.15, flex: 1 }}>
                <div style={{ display: "flex" }}>
                  <span className="mut" style={{ flex: 1 }}>Conso. mesurée</span>
                  <b>{prioritaire.batiment.conso_mesuree_kwh_m2} kWh/m²·an</b>
                </div>
                <div style={{ display: "flex" }}>
                  <span className="mut" style={{ flex: 1 }}>Score de risque</span>
                  <b style={{ color: "#C0503F" }}>{prioritaire.score.risque}/100</b>
                </div>
                <div style={{ display: "flex" }}>
                  <span className="mut" style={{ flex: 1 }}>Score global (SCT)</span>
                  <b>{prioritaire.score.sct}/100</b>
                </div>
              </div>
              <div style={{ padding: "12px 16px", borderTop: "1px solid #EDF1F3" }}>
                <Link href={`/batiments/${prioritaire.batiment.id}`} className="btn">
                  Voir la fiche bâtiment →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
