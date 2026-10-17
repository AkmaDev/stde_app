"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ETAT_LABEL } from "@/lib/ui";
import { Batiment, DocumentBatiment, LigneLevierBatiment } from "@/lib/api";
import { CaracData } from "@/lib/caracAdapter";
import { Proposition } from "@/lib/propositions";
import FicheMapLoader from "./FicheMapLoader";
import StreetView from "./StreetView";
import DocumentsList from "./DocumentsList";
import ConsommationMensuelleChart from "./ConsommationMensuelleChart";
import Batiment3D from "./Batiment3D";
import CaracteristiquesTab from "./CaracteristiquesTab";

// Couleurs des tags d'état des leviers -- mêmes valeurs que ORIGINE_CLASS/TAG
// du redesign (doc=bleu, obs=vert, hyp=ambre), étendues à l'état "Exclusion".
const LEV_TAG: Record<string, [string, string]> = {
  applicable: ["#0063cb", "#e8edff"],
  deja_realise: ["#18753c", "#b8fec9"],
  donnees_insuffisantes: ["#716043", "#feecc2"],
  non_applicable: ["#666", "#eee"],
};

export default function FicheBatimentTabs({
  carac,
  leviers,
  latitude,
  longitude,
  nom,
  documents,
  batiment,
}: {
  carac: CaracData;
  leviers: LigneLevierBatiment[];
  latitude: number | null;
  longitude: number | null;
  nom: string;
  documents: DocumentBatiment[];
  batiment: Batiment;
}) {
  // Ouvert par défaut sur le plan cadastral : au clic sur un bâtiment (carte,
  // liste, comparateur...), Jean attend le zoom cadastral immédiat, pas la
  // liste de caractéristiques.
  const [tab, setTab] = useState<
    "caracteristiques" | "leviers" | "plan" | "streetview" | "documents" | "consommations_mensuelles" | "volume3d"
  >("plan");

  // Volume 3D : reconstruit depuis les façades RNB/APUR, disponible seulement
  // pour les bâtiments à géométrie vérifiée — onglet caché plutôt que vide
  // pour les autres (même principe que les lignes façade en Caractéristiques).
  const volume3dDisponible = batiment.rnb_verifie && batiment.facade_segments.length > 0;

  // Propositions de correction (Brique 1 -- "Modifier") : un seul fichier
  // JSON partagé (Vercel Blob, voir lib/propositions.ts), rechargé à chaque
  // fois qu'une proposition est créée/décidée (onChange ci-dessous).
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [rechargeCle, setRechargeCle] = useState(0);
  useEffect(() => {
    if (tab !== "caracteristiques") return;
    fetch(`/api/propositions?batimentId=${batiment.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setPropositions)
      .catch(() => setPropositions([]));
  }, [tab, batiment.id, rechargeCle]);

  // Mode admin : pas de vrai système de comptes -- un mot de passe partagé,
  // jamais vérifié côté client, seulement envoyé à l'API au moment de
  // valider/rejeter (voir app/api/propositions/[id]/route.ts).
  const [admin, setAdmin] = useState(false);
  function demanderMotDePasse(): string | null {
    const pwd = window.prompt("Mot de passe administrateur :");
    return pwd;
  }

  const TABS: { key: typeof tab; label: string }[] = [
    { key: "caracteristiques", label: "Caractéristiques" },
    { key: "consommations_mensuelles", label: "Consommation mensuelle" },
    { key: "documents", label: "Documents" },
    { key: "plan", label: "Plan cadastral" },
    { key: "streetview", label: "Vue de rue" },
    ...(volume3dDisponible ? [{ key: "volume3d" as const, label: "Volume 3D" }] : []),
    { key: "leviers", label: "Leviers" },
  ];

  const nApp = leviers.filter((l) => l.etat === "applicable").length;
  const nDone = leviers.filter((l) => l.etat === "deja_realise").length;
  const nExcl = leviers.filter((l) => l.etat === "non_applicable").length;

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", borderBottom: "1px solid #ddd" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: "none",
              border: 0,
              borderBottom: `2px solid ${tab === t.key ? "#000091" : "transparent"}`,
              marginBottom: -1,
              color: tab === t.key ? "#000091" : "#3a3a3a",
              padding: "12px 16px",
              fontSize: 15,
              fontWeight: tab === t.key ? 500 : 400,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: "32px 0" }}>
        {tab === "plan" ? (
          <FicheMapLoader latitude={latitude} longitude={longitude} nom={nom} batiment={batiment} />
        ) : tab === "streetview" ? (
          <StreetView latitude={latitude} longitude={longitude} />
        ) : tab === "volume3d" ? (
          <Batiment3D batiment={batiment} />
        ) : tab === "documents" ? (
          <DocumentsList documents={documents} />
        ) : tab === "consommations_mensuelles" ? (
          <ConsommationMensuelleChart batiment={batiment} />
        ) : tab === "caracteristiques" ? (
          <CaracteristiquesTab
            batimentId={batiment.id}
            rows={carac.rows}
            facHeads={carac.facHeads}
            facades={carac.facades}
            scores={carac.scores}
            footnote={carac.footnote}
            documents={documents}
            propositions={propositions}
            admin={admin}
            setAdmin={setAdmin}
            demanderMotDePasse={demanderMotDePasse}
            onChange={() => setRechargeCle((k) => k + 1)}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
                <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Leviers de rénovation</h2>
                <p style={{ margin: 0, fontSize: 16 }}>Qualification de chaque levier pour ce bâtiment. Les gains sont des ordres de grandeur, sur le poste concerné.</p>
              </div>
              <span style={{ fontSize: 15, color: "#3a3a3a" }}>
                {nApp} applicable{nApp > 1 ? "s" : ""} · {nDone} déjà réalisé{nDone > 1 ? "s" : ""} · {nExcl} exclu{nExcl > 1 ? "s" : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #ddd" }}>
              {leviers.map((l) => {
                const [c, bg] = LEV_TAG[l.etat];
                return (
                  <div key={l.levier.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,.9fr) 88px minmax(0,2.4fr)", gap: 24, alignItems: "start", padding: "20px 0", borderBottom: "1px solid #eee" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 500, color: "#161616" }}>{l.levier.nom}</span>
                      <Link href={`/comparateur?levier=${l.levier.id}`} style={{ fontSize: 13, color: "#000091" }}>Comparer sur le parc</Link>
                    </span>
                    <span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: c, background: bg, padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{ETAT_LABEL[l.etat]}</span>
                    </span>
                    <span className="num" style={{ fontSize: 18, fontWeight: 700, color: "#161616", whiteSpace: "nowrap" }}>
                      {l.gain_indicatif_pct ? `−${l.gain_indicatif_pct} %` : "—"}
                    </span>
                    <span style={{ fontSize: 15, color: "#3a3a3a", lineHeight: 1.5 }}>{l.commentaire ?? "Pas encore évalué pour ce bâtiment."}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "#666", maxWidth: 720 }}>
              Les gains ne s&apos;additionnent pas : plusieurs leviers agissent sur le même poste.{" "}
              <Link href="/etat-du-projet" style={{ color: "#000091" }}>Méthode de calcul</Link>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
