"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopTabs from "@/components/TopTabs";
import { Levier, getBatimentsPourLevier, getLeviers } from "@/lib/api";
import { ETAT_CLASS, ETAT_LABEL } from "@/lib/ui";

export default function ComparateurPage() {
  const [leviers, setLeviers] = useState<Levier[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof getBatimentsPourLevier>> | null>(null);

  useEffect(() => {
    getLeviers().then((liste) => {
      setLeviers(liste);
      if (liste.length > 0) setSelectedId(liste[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      getBatimentsPourLevier(selectedId).then(setData);
    }
  }, [selectedId]);

  const candidats = data?.batiments.filter((l) => l.etat === "applicable").length ?? 0;
  const total = data?.batiments.length ?? 0;
  const gainCumule = data
    ? data.batiments
        .filter((l) => l.etat === "applicable" && l.gain_indicatif_pct)
        .reduce((acc, l) => acc + (l.gain_indicatif_pct ?? 0), 0) / (candidats || 1)
    : 0;

  return (
    <>
      <div className="crumb">Entrée par levier</div>
      <div className="h1">
        Comparateur de leviers <small>quels bâtiments sont candidats à cette action ?</small>
      </div>
      <div className="panel">
        <TopTabs />
        <div className="subtabs">
          <div style={{ fontSize: 12, color: "#8A9AA3", alignSelf: "center", marginRight: 4 }}>LEVIER :</div>
          {leviers.map((l) => (
            <div
              key={l.id}
              className={`chip${l.id === selectedId ? " on" : ""}`}
              onClick={() => setSelectedId(l.id)}
            >
              {l.nom}
            </div>
          ))}
        </div>
        <div className="content" style={{ display: "flex", gap: 18 }}>
          {data && (
            <>
              <div style={{ width: 296, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "15px 17px", background: "#FBFCFD" }}>
                  <div style={{ fontSize: 11, letterSpacing: 0.9, color: "#8A9AA3" }}>LEVIER SÉLECTIONNÉ</div>
                  <div style={{ fontSize: 17, fontWeight: 700, margin: "3px 0 8px" }}>{data.levier.nom}</div>
                  <div style={{ fontSize: 12, color: "#5B6E77", lineHeight: 1.65 }}>
                    Poste concerné : <b>{data.levier.poste_concerne}</b><br />
                    Plage de gain retenue : <b>{data.levier.gain_min_pct} – {data.levier.gain_max_pct} %</b> du poste<br />
                    Source : {data.levier.source}
                  </div>
                </div>
                <div style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "15px 17px", background: "#12333F", color: "#fff" }}>
                  <div style={{ fontSize: 11, letterSpacing: 0.9, color: "#8FB4C1" }}>SYNTHÈSE</div>
                  <div style={{ fontSize: 29, fontWeight: 700, margin: "4px 0" }}>{candidats} bâtiments</div>
                  <div style={{ fontSize: 12, color: "#B9CDD5", lineHeight: 1.6 }}>
                    candidats sur {total} — gain indicatif moyen{" "}
                    <b style={{ color: "#D98C2B" }}>− {gainCumule.toFixed(1)}%</b> sur les bâtiments applicables.
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 11.5, color: "#8A9AA3", marginBottom: 10 }}>
                  {total} résultats · triés par état
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Bâtiment</th>
                      <th>Arr.</th>
                      <th>Surface m²</th>
                      <th>Système</th>
                      <th>État du couple</th>
                      <th>Gain indicatif</th>
                      <th>Commentaire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.batiments]
                      .sort((a, b) => (b.gain_indicatif_pct ?? -1) - (a.gain_indicatif_pct ?? -1))
                      .map((l) => (
                        <tr key={l.batiment.id}>
                          <td>
                            <Link href={`/batiments/${l.batiment.id}`} style={{ color: "#12333F", fontWeight: 700, textDecoration: "none" }}>
                              {l.batiment.nom}
                            </Link>
                          </td>
                          <td className="mut">{l.batiment.arrondissement}</td>
                          <td>{l.batiment.surface_m2 ?? "—"}</td>
                          <td className="mut">{l.batiment.energie_principale ?? "—"}</td>
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
                <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid #F0F4F5", fontSize: 11.5, color: "#8A9AA3", lineHeight: 1.6 }}>
                  Les gains affichés sont des <b>ordres de grandeur indicatifs</b> — squelette du moteur d&apos;analyse,
                  à recalibrer une fois les jeux de données avant/après réels disponibles.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
