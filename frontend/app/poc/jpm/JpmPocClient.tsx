"use client";

import { useState } from "react";
import { Batiment } from "@/lib/api";

type EntreeQualif = {
  parametre: string;
  valeur: string | null;
  unite: string;
  source: string | null;
  confiance: "A" | "B" | "C" | null;
  criticite: string;
  justification: string;
};

// Réutilise le même esprit visuel que ORIGINE_CLASS (lib/ui.ts) : A = fiable
// (vert, comme "Constatée"), B = réel mais incomplet (bleu, comme
// "Documentée"), C = catalogue générique (orange, comme "Hypothèse"), pas de
// confiance = gris (comme "absente").
const CONFIANCE_CLASS: Record<string, string> = { A: "t-mes", B: "t-doc", C: "t-hyp" };
const CONFIANCE_LABEL: Record<string, string> = { A: "Confiance A", B: "Confiance B", C: "Confiance C" };

function ConfianceBadge({ confiance }: { confiance: "A" | "B" | "C" | null }) {
  if (!confiance) {
    return (
      <span className="tag t-abs">
        <span className="dot" />
        Absente
      </span>
    );
  }
  return (
    <span className={`tag ${CONFIANCE_CLASS[confiance]}`}>
      <span className="dot" />
      {CONFIANCE_LABEL[confiance]}
    </span>
  );
}

export default function JpmPocClient({
  batiment,
  qualification,
  resultat,
}: {
  batiment: Batiment;
  qualification: { note: string; entrees: EntreeQualif[] };
  resultat: {
    hypotheses: Record<string, unknown>;
    scenarios: {
      nom: string;
      protection_solaire: boolean;
      par_mois: { mois: string; transmission_kwh: number; solaire_kwh: number; solde_kwh: number }[];
      total_annuel: { transmission_kwh: number; solaire_kwh: number; solde_kwh: number };
    }[];
  };
}) {
  const [calculLance, setCalculLance] = useState(false);
  const segments = batiment.facade_segments.filter((f) => !f.bruit);

  return (
    <div className="panel">
      <div className="content" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Brique 0 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Brique 0 — Données invariables du bâtiment</div>
          <div style={{ fontSize: 11.5, color: "#5B6472", marginBottom: 10 }}>
            Récupérées en cliquant sur {batiment.nom} dans le portail (<code>getBatiment(16)</code>) — rien de nouveau à
            construire ici, cette donnée existe déjà dans l'app.
          </div>
          <table>
            <tbody>
              <tr>
                <td className="mut" style={{ width: 230 }}>
                  Hauteur (APUR)
                </td>
                <td>
                  <b>{batiment.hauteur_m} m</b>
                </td>
              </tr>
              <tr>
                <td className="mut">Coordonnées</td>
                <td>
                  <b>
                    {batiment.latitude}, {batiment.longitude}
                  </b>
                </td>
              </tr>
              <tr>
                <td className="mut">Façades exploitables</td>
                <td>
                  <b>{segments.length} segments réels</b> (longueur, orientation, azimut — géométrie APUR)
                </td>
              </tr>
              <tr>
                <td className="mut">Climat horaire</td>
                <td>
                  <b>8760 heures PVGIS</b> déjà en cache (température extérieure, irradiance)
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Brique 1 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Brique 1 — Qualification des données (C0_INPUT_REPORT)</div>
          <div style={{ fontSize: 11.5, color: "#5B6472", marginBottom: 10 }}>{qualification.note}</div>
          <table>
            <thead>
              <tr>
                <th>Paramètre</th>
                <th>Valeur</th>
                <th>Source</th>
                <th>Confiance</th>
                <th>Criticité</th>
              </tr>
            </thead>
            <tbody>
              {qualification.entrees.map((e) => (
                <tr key={e.parametre}>
                  <td className="mut" style={{ width: 210 }}>
                    {e.parametre}
                  </td>
                  <td style={{ cursor: "help" }} title={e.justification}>
                    <b>
                      {e.valeur ?? "—"} {e.valeur && e.unite ? e.unite : ""}
                    </b>
                  </td>
                  <td style={{ fontSize: 11.5, color: "#5B6472" }}>{e.source ?? "—"}</td>
                  <td style={{ width: 120 }}>
                    <ConfianceBadge confiance={e.confiance} />
                  </td>
                  <td style={{ fontSize: 11.5, color: "#5B6472", textTransform: "capitalize" }}>{e.criticite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Déclencheur Brique 3 */}
        <section>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Brique 3 — Calcul du métabolisme initial</div>
          {!calculLance ? (
            <button
              type="button"
              onClick={() => setCalculLance(true)}
              style={{
                background: "#000091",
                color: "white",
                border: "none",
                borderRadius: 6,
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Lancer le calcul
            </button>
          ) : (
            <>
              <div
                style={{
                  fontSize: 11.5,
                  color: "#5B6472",
                  marginBottom: 14,
                  background: "#F4F7F8",
                  border: "1px solid #E1E9EC",
                  borderRadius: 6,
                  padding: "8px 12px",
                }}
              >
                Résultat <b>précalculé</b> par <code>poc_bilan_horaire.py</code>, déterministe et reproductible (mêmes
                entrées → mêmes résultats) — pas un calcul en direct dans le navigateur. Couvre uniquement 2 flux sur les 5
                attendus par la Brique 3 (apports solaires et transmission) — ventilation, apports internes et confort
                restent hors périmètre, faute de source (voir Brique 1 ci-dessus).
              </div>
              <div style={{ fontSize: 11.5, color: "#5B6472", marginBottom: 10 }}>
                8 scénarios affichés côte à côte — <b>aucun n'est présenté comme "le" résultat</b>, l'ambiguïté réelle sur
                U_vitrage et g n'est pas résolue arbitrairement.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {resultat.scenarios.map((s) => (
                  <div key={s.nom} style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "10px 14px" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{s.nom}</div>
                    <div style={{ display: "flex", gap: 18, fontSize: 12 }}>
                      <div>
                        <span className="mut">Transmission</span>
                        <br />
                        <b className="num">{s.total_annuel.transmission_kwh.toLocaleString("fr-FR")} kWh</b>
                      </div>
                      <div>
                        <span className="mut">Apports solaires</span>
                        <br />
                        <b className="num">{s.total_annuel.solaire_kwh.toLocaleString("fr-FR")} kWh</b>
                      </div>
                      <div>
                        <span className="mut">Solde annuel</span>
                        <br />
                        <b className="num" style={{ color: s.total_annuel.solde_kwh < 0 ? "#C0503F" : "#3E9E6E" }}>
                          {s.total_annuel.solde_kwh.toLocaleString("fr-FR")} kWh
                        </b>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
