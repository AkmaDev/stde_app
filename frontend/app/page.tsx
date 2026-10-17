import Link from "next/link";
import ParcMapLoader from "@/components/ParcMapLoader";
import TableauBatiments from "@/components/TableauBatiments";
import { getBatiments, getIndicateurs } from "@/lib/api";

const ecartStr = (kwh: number) => `${kwh > 0 ? "+" : ""}${Math.round(kwh)} kWh/m²`;
const numFr = (x: number) => x.toLocaleString("fr-FR");

export default async function VueParcPage() {
  const batiments = await getBatiments();
  const indicateurs = await getIndicateurs();
  const documentes = batiments.filter((b) => b.batiment.conso_mesuree_kwh_m2 != null);
  const ecartParId = Object.fromEntries(
    indicateurs.classement_ecart_objectif.map(({ batiment, ecart_kwh_m2 }) => [batiment.id, ecart_kwh_m2])
  );
  const top4 = [...documentes]
    .sort((a, b) => (b.batiment.conso_mesuree_kwh_m2 ?? 0) - (a.batiment.conso_mesuree_kwh_m2 ?? 0))
    .slice(0, 4);

  return (
    <>
      <div className="section-bleed hero">
        <div className="hero-inner">
          <span className="hero-badge">
            <strong>Consommations 2023-2025</strong> : moyenne glissante sur les années complètes
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h1>Le parc culturel de la Ville de Paris</h1>
            <p className="lead">Mesurer, comprendre et prioriser la rénovation énergétique</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
            <a href="#tableau-batiments" className="btn inline">Voir les bâtiments documentés</a>
            <Link href="/comparateur" className="btn ghost inline">Comparer les leviers</Link>
          </div>
        </div>
      </div>

      <div className="full-bleed" style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 480px", padding: "96px 64px 96px max(32px,calc((100vw - 1200px)/2 + 32px))", display: "flex", flexDirection: "column", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#161616" }}>Où en est le parc ?</h2>
            <p style={{ margin: 0, fontSize: 17 }}>
              Consommation des {documentes.length} bâtiments documentés, comparée à l&apos;objectif de réduction de 40 % fixé pour 2030.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 32 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="num" style={{ fontSize: 30, fontWeight: 800, color: "#161616" }}>{numFr(indicateurs.conso_moyenne_ponderee_kwh_m2)}</span>
              <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em" }}>kWh/m²·an en moyenne</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="num" style={{ fontSize: 30, fontWeight: 800, color: "#161616" }}>−40 %</span>
              <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em" }}>Objectif 2030 (propre à chaque bâtiment)</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className="num" style={{ fontSize: 30, fontWeight: 800, color: "#161616" }}>+{numFr(indicateurs.ecart_moyen_objectif_2030_kwh_m2)}</span>
              <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em" }}>kWh/m² à économiser, en moyenne</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>{documentes.length} bâtiments documentés</span>
              <span className="mut">165 au total</span>
            </div>
            <div style={{ height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(documentes.length / 165) * 100}%`, background: "#000091" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="#tableau-batiments" className="btn inline">Voir le tableau</a>
            <button
              type="button"
              className="btn ghost inline"
              disabled
              title="Pas encore disponible — les corrections de données passent aujourd'hui par le bouton « Modifier » de chaque champ, sur la fiche d'un bâtiment."
              style={{ cursor: "not-allowed", opacity: 0.55 }}
            >
              Importer des documents
            </button>
          </div>
        </div>

        <div style={{ flex: "1 1 420px", background: "#f6f6f6", padding: "72px 48px 96px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#666", marginBottom: 12 }}>
            Priorités de rénovation
          </span>
          {top4.map(({ batiment }) => {
            const ecart_kwh_m2 = ecartParId[batiment.id];
            return (
              <Link key={batiment.id} href={`/batiments/${batiment.id}`} className="card-prio">
                <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: "#161616" }}>{batiment.nom}</span>
                  <span className="num" style={{ fontSize: 14, color: "#3558a2" }}>
                    Paris {batiment.arrondissement} · {batiment.conso_mesuree_kwh_m2} kWh/m²·an
                  </span>
                </span>
                <span className="num" style={{ fontSize: 14, color: "#666", whiteSpace: "nowrap" }}>
                  {ecartStr(ecart_kwh_m2)}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="section-bleed" style={{ background: "#f6f6f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "96px 32px" }}>
          <div style={{ background: "#fff", padding: 32, display: "flex", flexDirection: "column", gap: 36 }}>
            <div style={{ height: 580 }}>
              <ParcMapLoader buildings={batiments} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 620 }}>
                <span style={{ width: 56, height: 56, borderRadius: "50%", background: "#fde4e1", color: "#161616", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 13.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
                    <path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z" />
                  </svg>
                </span>
                <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#161616" }}>Carte du parc</h2>
                <p style={{ margin: 0, fontSize: 18, lineHeight: 1.6 }}>
                  <strong style={{ color: "#161616" }}>Situez chaque bâtiment culturel</strong> et comparez-les selon leur priorité de rénovation, leur consommation ou leur écart à l&apos;objectif 2030.
                </p>
              </div>
              <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                <Link href="/etat-du-projet" style={{ fontSize: 16 }}>Méthode de calcul</Link>
                <a href="#tableau-batiments" className="btn inline" style={{ padding: "12px 22px", fontSize: 16 }}>Voir le tableau</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TableauBatiments documentes={documentes} ecartParId={ecartParId} />
    </>
  );
}
