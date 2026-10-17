"use client";

import { useState } from "react";
import Link from "next/link";
import { EtatCouple, Levier, getBatimentsPourLevier } from "@/lib/api";

type Donnees = Awaited<ReturnType<typeof getBatimentsPourLevier>>;

const GROUPES: { etat: EtatCouple; titre: string; c: string; bg: string; desc: string }[] = [
  { etat: "applicable", titre: "Applicable", c: "#0063cb", bg: "#e8edff", desc: "Le levier est pertinent au vu des équipements relevés. Gain estimé sur le poste concerné." },
  { etat: "deja_realise", titre: "Déjà réalisé", c: "#18753c", bg: "#b8fec9", desc: "L'équipement est déjà en place ; aucun gain supplémentaire attendu." },
  { etat: "donnees_insuffisantes", titre: "Données insuffisantes", c: "#716043", bg: "#feecc2", desc: "Les documents reçus ne permettent pas de conclure. Compléter le dossier pour qualifier le levier." },
  { etat: "non_applicable", titre: "Exclusion", c: "#666", bg: "#eee", desc: "Le levier ne s'applique pas à ce bâtiment (équipement, usage ou contrainte incompatible)." },
];

export default function ComparateurClient({
  leviers,
  donnees,
  initialLevierId,
}: {
  leviers: Levier[];
  donnees: Donnees[];
  initialLevierId?: number;
}) {
  const [selectedId, setSelectedId] = useState(initialLevierId ?? leviers[0]?.id);
  const data = donnees.find((d) => d.levier.id === selectedId) ?? donnees[0];

  const candidats = data.batiments.filter((l) => l.etat === "applicable");
  const avg = candidats.length
    ? candidats.reduce((acc, l) => acc + (l.gain_indicatif_pct ?? 0), 0) / candidats.filter((l) => l.gain_indicatif_pct).length
    : null;
  const aDocumenter = data.batiments.filter((l) => l.etat === "donnees_insuffisantes").length;

  const groupes = GROUPES.map((g) => ({
    ...g,
    lignes: data.batiments.filter((l) => l.etat === g.etat).sort((a, b) => (b.gain_indicatif_pct ?? 0) - (a.gain_indicatif_pct ?? 0)),
  })).filter((g) => g.lignes.length > 0);

  return (
    <>
      <div className="crumb">Accueil &nbsp;›&nbsp; Comparateur de leviers</div>
      <section style={{ padding: "0 0 32px", display: "flex", flexDirection: "column", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, color: "#000091", lineHeight: 1.15 }}>Comparateur de leviers</h1>
          <p style={{ margin: 0, fontFamily: "var(--font-serif),Spectral,Georgia,serif", fontStyle: "italic", fontSize: 20, color: "#000091" }}>
            Quels bâtiments sont candidats à cette action ?
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 14, color: "#666" }}>Levier</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {leviers.map((l) => (
              <button key={l.id} type="button" className={`pill-toggle${l.id === selectedId ? " on" : ""}`} onClick={() => setSelectedId(l.id)}>
                {l.nom}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="section-bleed" style={{ background: "#f6f6f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 32px", display: "flex", gap: 48, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 440 }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>{data.levier.nom}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Meta k="Poste concerné" v={data.levier.poste_concerne} />
              <Meta k="Plage de gain retenue" v={`${data.levier.gain_min_pct} – ${data.levier.gain_max_pct} % du poste`} />
              <Meta k="Source" v={data.levier.source} />
            </div>
          </div>
          <div style={{ flex: "2 1 480px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 24 }}>
            <div style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>Candidats</span>
              <span className="num" style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>
                {candidats.length} <span style={{ fontSize: 15, fontWeight: 400, color: "#666" }}>sur {data.batiments.length}</span>
              </span>
            </div>
            <div style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>Gain indicatif moyen</span>
              <span className="num" style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>{avg == null ? "—" : `−${avg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}</span>
              <span style={{ fontSize: 14, color: "#666" }}>sur les bâtiments candidats</span>
            </div>
            <div style={{ background: "#fff", boxShadow: "0 6px 18px rgba(0,0,18,.08)", padding: 28, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: ".02em", color: "#666" }}>À documenter</span>
              <span className="num" style={{ fontSize: 32, fontWeight: 800, color: "#161616" }}>{aDocumenter}</span>
              <span style={{ fontSize: 14, color: "#666" }}>données insuffisantes</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "80px 0 112px", display: "flex", flexDirection: "column", gap: 64 }}>
        {groupes.length === 0 && (
          <div style={{ background: "#f6f6f6", padding: 24, fontSize: 15, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ color: "#161616", fontWeight: 500 }}>L&apos;analyse de ce levier n&apos;est pas encore disponible.</span>
            <span>Elle sera calculée dès que les données des bâtiments auront été chargées.</span>
          </div>
        )}
        {groupes.map((g) => (
          <section key={g.etat} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#161616" }}>{g.titre}</h2>
              <span style={{ fontSize: 12, fontWeight: 500, color: g.c, background: g.bg, padding: "2px 8px", borderRadius: 4 }}>{g.lignes.length}</span>
            </div>
            <p style={{ margin: 0, fontSize: 15, maxWidth: 640 }}>{g.desc}</p>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #ddd" }}>
              {g.lignes.map((l) => (
                <Link
                  key={l.batiment.id}
                  href={`/batiments/${l.batiment.id}`}
                  className="table-row-hover"
                  style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,.6fr) minmax(0,2.4fr)", gap: 24, alignItems: "start", padding: "20px 0", borderBottom: "1px solid #eee", textDecoration: "none", color: "inherit" }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 16, color: "#000091", fontWeight: 500 }}>{l.batiment.nom}</span>
                    <span style={{ fontSize: 13, color: "#888" }}>
                      Paris {l.batiment.arrondissement}
                      {l.batiment.surface_m2 ? ` · ${l.batiment.surface_m2} m²` : ""}
                      {l.batiment.energie_principale ? ` · ${l.batiment.energie_principale}` : ""}
                    </span>
                  </span>
                  <span className="num" style={{ fontSize: 18, fontWeight: 700, color: "#161616" }}>{l.gain_indicatif_pct ? `−${l.gain_indicatif_pct} %` : "—"}</span>
                  <span style={{ fontSize: 15, color: "#3a3a3a", lineHeight: 1.5 }}>{l.commentaire ?? "—"}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
        <p style={{ margin: 0, fontSize: 14, color: "#666", maxWidth: 720 }}>
          Les gains affichés sont des ordres de grandeur indicatifs — squelette du moteur d&apos;analyse, à recalibrer une fois les jeux de données avant/après réels disponibles.{" "}
          <Link href="/etat-du-projet" style={{ color: "#000091" }}>Méthode de calcul</Link>
        </p>
      </div>
    </>
  );
}

function Meta({ k, v }: { k: string; v?: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13, color: "#666" }}>{k}</span>
      <span style={{ fontSize: 15, color: "#161616" }}>{v || "À compléter"}</span>
    </div>
  );
}
