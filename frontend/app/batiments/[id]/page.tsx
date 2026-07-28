import { getBatiment } from "@/lib/api";
import { ETAT_CLASS, ETAT_LABEL, ORIGINE_CLASS, ORIGINE_LABEL } from "@/lib/ui";

export default async function FicheBatimentPage({ params }: { params: { id: string } }) {
  const { batiment, score, leviers } = await getBatiment(Number(params.id));

  const caracteristiques: { label: string; valeur: string | number | null; origine: keyof typeof ORIGINE_LABEL }[] = [
    { label: "Année de construction", valeur: batiment.annee_construction, origine: "documentee" },
    { label: "Surface de référence", valeur: batiment.surface_m2 ? `${batiment.surface_m2} m²` : null, origine: "documentee" },
    { label: "Énergie principale", valeur: batiment.energie_principale, origine: "documentee" },
    { label: "Orientation vitrage dominante", valeur: batiment.orientation_vitrage_dominante, origine: "hypothese" },
    { label: "Type d'isolation", valeur: batiment.type_isolation, origine: "hypothese" },
    { label: "DPE", valeur: batiment.dpe, origine: "documentee" },
    { label: "Consommation mesurée", valeur: batiment.conso_mesuree_kwh_m2 ? `${batiment.conso_mesuree_kwh_m2} kWh/m²·an` : null, origine: batiment.conso_origine },
    { label: "Contrainte patrimoniale", valeur: batiment.statut_patrimonial, origine: "documentee" },
  ];

  return (
    <>
      <div className="crumb">Ensemble du parc &nbsp;›&nbsp; Fiche bâtiment</div>
      <div className="h1">
        {batiment.nom}
        <small>
          Paris {batiment.arrondissement} · {batiment.statut_patrimonial}
        </small>
      </div>
      <div className="panel">
        <div className="tabs">
          <div className="tab on">Caractéristiques</div>
          <div className="tab">Leviers</div>
        </div>
        <div className="content" style={{ display: "flex", gap: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Caractéristiques du bâtiment</div>
            <table>
              <thead>
                <tr>
                  <th>Donnée</th>
                  <th>Valeur</th>
                  <th>Origine</th>
                </tr>
              </thead>
              <tbody>
                {caracteristiques.map((c) => (
                  <tr key={c.label}>
                    <td className="mut" style={{ width: 230 }}>{c.label}</td>
                    <td>
                      <b>{c.valeur ?? "—"}</b>
                    </td>
                    <td style={{ width: 140 }}>
                      <span className={`tag ${ORIGINE_CLASS[c.origine]}`}>{ORIGINE_LABEL[c.origine]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 10px" }}>Leviers qualifiés</div>
            <table>
              <thead>
                <tr>
                  <th>Levier</th>
                  <th>État</th>
                  <th>Gain indicatif</th>
                  <th>Commentaire</th>
                </tr>
              </thead>
              <tbody>
                {leviers.map((l) => (
                  <tr key={l.levier.id}>
                    <td><b>{l.levier.nom}</b></td>
                    <td>
                      <span className={`state ${ETAT_CLASS[l.etat]}`}>{ETAT_LABEL[l.etat]}</span>
                    </td>
                    <td style={{ color: l.gain_indicatif_pct ? "#3E7B5C" : "#9AA8AE", fontWeight: 700 }}>
                      {l.gain_indicatif_pct ? `− ${l.gain_indicatif_pct}%` : "—"}
                    </td>
                    <td className="mut">{l.commentaire ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "14px 16px", background: "#FBFCFD" }}>
              <div style={{ fontSize: 11, letterSpacing: 0.9, color: "#8A9AA3" }}>COUVERTURE DES DONNÉES</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: "#1C7293", margin: "4px 0 2px" }}>
                {batiment.couverture_donnees_pct ?? "—"}%
              </div>
            </div>
            <div style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, letterSpacing: 0.9, color: "#8A9AA3", marginBottom: 9 }}>SCORE (SCT)</div>
              <div style={{ fontSize: 12.5, lineHeight: 2.1 }}>
                <div style={{ display: "flex" }}>
                  <span className="mut" style={{ flex: 1 }}>Risque</span><b>{score.risque}/100</b>
                </div>
                <div style={{ display: "flex" }}>
                  <span className="mut" style={{ flex: 1 }}>Urgence</span><b>{score.urgence}/100</b>
                </div>
                <div style={{ display: "flex" }}>
                  <span className="mut" style={{ flex: 1 }}>Faisabilité</span><b>{score.faisabilite}/100</b>
                </div>
                <div style={{ display: "flex", borderTop: "1px solid #F0F4F5", marginTop: 6, paddingTop: 6 }}>
                  <span style={{ flex: 1, fontWeight: 700 }}>Score global</span><b>{score.sct}/100</b>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#8A9AA3", marginTop: 10, lineHeight: 1.5, borderTop: "1px solid #F0F4F5", paddingTop: 9 }}>
                Score comparatif, calculé sur données de démonstration — pas une prédiction (moteur d&apos;analyse à calibrer).
              </div>
            </div>
            <div style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "14px 16px" }}>
              <div style={{ fontSize: 11, letterSpacing: 0.9, color: "#8A9AA3", marginBottom: 9 }}>DERNIÈRE MISE À JOUR</div>
              <div style={{ fontSize: 12.5, color: "#4A5C65" }}>{batiment.derniere_maj ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
