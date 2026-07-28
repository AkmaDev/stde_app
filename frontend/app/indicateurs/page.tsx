import Link from "next/link";
import TopTabs from "@/components/TopTabs";
import { getIndicateurs } from "@/lib/api";

export default async function IndicateursPage() {
  const data = await getIndicateurs();

  return (
    <>
      <div className="crumb">Vue d&apos;ensemble</div>
      <div className="h1">
        Ensemble du parc <small>Indicateurs globaux — périmètre test {data.nb_batiments_documentes} bâtiments</small>
      </div>
      <div className="panel">
        <TopTabs />
        <div className="subtabs">
          <div className="chip on">Décret Tertiaire</div>
        </div>
        <div className="content" style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <div style={{ display: "flex", gap: 13 }}>
            <div className="kpi">
              <div className="val">
                {data.conso_moyenne_ponderee_kwh_m2} <span>kWh/m²·an</span>
              </div>
              <div className="label">Consommation moyenne pondérée</div>
            </div>
            <div className="kpi">
              <div className="val" style={{ color: "#C0503F" }}>
                + {data.ecart_moyen_objectif_2030_pct}% <span>au-dessus</span>
              </div>
              <div className="label">Écart moyen à l&apos;objectif 2030 ({data.objectif_2030_kwh_m2} kWh/m²·an)</div>
            </div>
            <div className="kpi">
              <div className="val" style={{ color: "#1C7293" }}>
                {data.nb_batiments_qualifies_3_leviers} / {data.nb_batiments_documentes} <span>bâtiments</span>
              </div>
              <div className="label">Qualifiés sur au moins 3 leviers</div>
            </div>
            <div className="kpi">
              <div className="val" style={{ color: "#3E7B5C" }}>
                − {data.gain_potentiel_moyen_pct}% <span>potentiel</span>
              </div>
              <div className="label">Gain indicatif moyen, leviers applicables (écrêté)</div>
            </div>
          </div>
          <div style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "15px 17px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 11 }}>
              Bâtiments les plus éloignés de l&apos;objectif
            </div>
            <table>
              <thead>
                <tr>
                  <th>Bâtiment</th>
                  <th>Arr.</th>
                  <th>kWh/m²</th>
                  <th>Écart 2030</th>
                  <th>Statut patrimonial</th>
                </tr>
              </thead>
              <tbody>
                {data.classement_ecart_objectif.map(({ batiment, ecart_pct }) => (
                  <tr key={batiment.id}>
                    <td>
                      <Link href={`/batiments/${batiment.id}`} style={{ color: "#12333F", fontWeight: 700, textDecoration: "none" }}>
                        {batiment.nom}
                      </Link>
                    </td>
                    <td className="mut">{batiment.arrondissement}</td>
                    <td>{batiment.conso_mesuree_kwh_m2}</td>
                    <td style={{ color: ecart_pct > 0 ? "#C0503F" : "#3E7B5C", fontWeight: 700 }}>
                      {ecart_pct > 0 ? "+ " : "− "}
                      {Math.abs(ecart_pct)}%
                    </td>
                    <td className="mut">{batiment.statut_patrimonial}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
