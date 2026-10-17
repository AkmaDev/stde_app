// Adaptateur : transforme les vraies données d'un bâtiment (lib/api.ts) dans le
// format attendu par components/CaracteristiquesTab.tsx (voir
// design_handoff_sdte/CARACTERISTIQUES.md). Aucune donnée inventée : un champ
// sans valeur réelle n'a simplement pas d'entrée ici (cf. ligne 161 de
// l'ancien app/batiments/[id]/page.tsx, même règle reprise ici).
import {
  Batiment,
  AdresseRNB,
  OrigineDonnee,
  scoreRisque,
  scoreUrgence,
  scoreFaisabilite,
  hauteurEtageReelle,
  apportSolaireFacade,
} from "./api";
import { dpeExpireLim } from "./caracFields";

export type St = "doc" | "hyp" | "obs" | "none";
export type Row = { code: string; label: string; value: string; st: St; anchor: string };
export type FacadeRow = { n: string; cells: { txt: string; hyp?: boolean; anchor: string }[]; ap: number };
export type ScoreRow = { label: string; val: number | null };
export type CaracData = {
  rows: Row[];
  facHeads: { h: string; anchor: string }[];
  facades: FacadeRow[];
  scores: ScoreRow[];
  footnote: { status: string; dpeDate?: string; suivi?: string };
};

export const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const ORIGINE_TO_ST: Record<OrigineDonnee | "absente", St> = {
  documentee: "doc",
  hypothese: "hyp",
  mesuree: "obs",
  absente: "none",
};

function formatAdresseRNB(a: AdresseRNB) {
  return `${a.numero ?? ""}${a.suffixe ?? ""} ${a.rue}, ${a.code_postal} ${a.ville}`.trim();
}

function anchorFor(nomSlug: string, code: string) {
  return `${nomSlug}--${code.toLowerCase().replace(".", "")}`;
}

export function adaptCarac(batiment: Batiment): CaracData {
  const bs = slug(batiment.nom);
  const rows: Row[] = [];

  function push(code: string, label: string, valeur: string | number | null, origine: OrigineDonnee) {
    const st = valeur == null ? "none" : ORIGINE_TO_ST[origine];
    rows.push({ code, label, value: valeur == null ? "—" : String(valeur), st, anchor: anchorFor(bs, code) });
  }

  // A. Identification
  push("A.1", "Année de construction", batiment.annee_construction, "documentee");
  push(
    "A.2",
    "Contrainte patrimoniale",
    batiment.statut_patrimonial,
    batiment.id === 2 ? "hypothese" : "documentee"
  );

  // B. Structure
  push("B.1", "Nombre d'étages", batiment.nombre_etages, "documentee");
  push("B.2", "Surface de référence", batiment.surface_m2 ? `${batiment.surface_m2} m²` : null, "documentee");

  // C. Géométrie (seulement si la géométrie RNB/APUR a été vérifiée manuellement)
  const adresseConnueNorm = (batiment.adresse ?? "").toLowerCase();
  const adressePrincipaleRNB = batiment.rnb_adresses.find((a) => {
    const numeroComplet = `${a.numero ?? ""}${a.suffixe ?? ""}`.toLowerCase();
    return numeroComplet.length > 0 && adresseConnueNorm.includes(numeroComplet) && adresseConnueNorm.includes(a.rue.toLowerCase());
  });
  const autresAccesRNB = batiment.rnb_adresses.filter((a) => a !== adressePrincipaleRNB);

  if (batiment.rnb_verifie) {
    push(
      "C.1",
      "Hauteur du bâtiment (APUR)",
      batiment.hauteur_m ? `${batiment.hauteur_m} m (min ${batiment.hauteur_min_m} · max ${batiment.hauteur_max_m})` : null,
      "documentee"
    );
    const het = hauteurEtageReelle(batiment);
    push("C.2", "Hauteur d'étage (moyenne calculée)", het ? `${het} m` : null, "hypothese");
    if (adressePrincipaleRNB) {
      push("C.3", "Adresse vérifiée (RNB)", formatAdresseRNB(adressePrincipaleRNB), "documentee");
    }
    autresAccesRNB.forEach((a, i) => {
      push(`C.${4 + i}`, `Autre accès au même bâtiment (${i + 1})`, formatAdresseRNB(a), "documentee");
    });
  }

  // D. Enveloppe
  push("D.1", "Type d'isolation", batiment.type_isolation, "hypothese");
  push("D.2", "Nature de la toiture", batiment.nature_toiture, "documentee");
  push("D.3", "Matière de la toiture", batiment.matiere_toiture, "documentee");
  push("D.4", "Ouvertures en toiture", batiment.ouvertures_toiture, "documentee");
  push(
    "D.5",
    "R estimé d'isolation",
    batiment.r_isolation_estime ? `${batiment.r_isolation_estime} m².K/W` : null,
    "hypothese"
  );
  batiment.vitrages_par_etage.forEach((v, i) => {
    const valeur = v.surface_m2 ? `${v.surface_m2} m² · ${v.nature ?? "nature non renseignée"}` : v.nature;
    push(`D.${6 + i}`, `Vitrage — ${v.niveau}`, valeur, "documentee");
  });

  // F. Énergie
  push("F.1", "Énergie principale", batiment.energie_principale, "documentee");
  push("F.2", "Classe DPE", batiment.dpe ? `Classe ${batiment.dpe}` : null, "documentee");
  push(
    "F.3",
    "Consommation mesurée",
    batiment.conso_mesuree_kwh_m2 ? `${batiment.conso_mesuree_kwh_m2} kWh/m²·an` : null,
    batiment.conso_origine
  );
  batiment.consommations_secondaires.forEach((c, i) => {
    push(
      `F.${4 + i}`,
      `Consommation mesurée (${c.energie})`,
      c.conso_mesuree_kwh_m2 ? `${c.conso_mesuree_kwh_m2} kWh/m²·an` : null,
      "mesuree"
    );
  });

  // E. Façades et apports solaires (seulement si géométrie vérifiée)
  const facadesReelles = batiment.rnb_verifie ? batiment.facade_segments.filter((f) => !f.bruit) : [];
  const facHeads = [
    { h: "Longueur", anchor: anchorFor(bs, "E.1") },
    { h: "Orientation", anchor: anchorFor(bs, "E.2") },
    { h: "Vitrage", anchor: anchorFor(bs, "E.3") },
    { h: "Irradiation", anchor: anchorFor(bs, "E.4") },
    { h: "Apport", anchor: anchorFor(bs, "E.5") },
  ];
  const facades: FacadeRow[] = facadesReelles.map((f) => {
    const ap = apportSolaireFacade(batiment, f);
    const calcule = f.vitrage_note?.startsWith("Calcule") ?? false;
    return {
      n: `Façade ${f.index} (${f.orientation})`,
      ap: ap ?? 0,
      cells: [
        { txt: `${f.longueur_m.toFixed(1)} m`, anchor: anchorFor(bs, "E.1") + `-f${f.index}` },
        { txt: f.orientation, anchor: anchorFor(bs, "E.2") + `-f${f.index}` },
        {
          txt: f.taux_vitrage_estime_pct != null ? `${f.taux_vitrage_estime_pct} %` : "—",
          hyp: f.taux_vitrage_estime_pct != null && !calcule,
          anchor: anchorFor(bs, "E.3") + `-f${f.index}`,
        },
        {
          txt: f.irradiance_corrigee_kwh_m2_an != null ? `${Math.round(f.irradiance_corrigee_kwh_m2_an)} kWh/m²` : f.irradiance_kwh_m2_an != null ? `${Math.round(f.irradiance_kwh_m2_an)} kWh/m²` : "—",
          anchor: anchorFor(bs, "E.4") + `-f${f.index}`,
        },
        { txt: ap != null ? `${ap.toLocaleString("fr-FR")} kWh/an` : "—", anchor: anchorFor(bs, "E.5") + `-f${f.index}` },
      ],
    };
  });

  // Score SCT
  const risque = scoreRisque(batiment);
  const urgence = scoreUrgence(batiment);
  const faisabilite = scoreFaisabilite(batiment);
  const scores: ScoreRow[] = [
    { label: "Risque", val: risque },
    { label: "Urgence", val: urgence },
    { label: "Faisabilité", val: faisabilite },
  ];

  const dpeExpire = dpeExpireLim(batiment);
  const statusDpe = dpeExpire ? ` ${dpeExpire}` : "";

  return {
    rows,
    facHeads,
    facades,
    scores,
    footnote: {
      status: `Calculé sur données réelles mais non calibré (moteur d'analyse à calibrer). Urgence et Score global indisponibles pour certains bâtiments selon les données déjà collectées. Le critère Risque normalise l'écart de consommation sur un repère fixe de 128 kWh/m²·an (identique pour tout le parc, utile pour comparer les bâtiments entre eux) — à ne pas confondre avec l'« Objectif 2030 » affiché sur la fiche, l'accueil, les Indicateurs et la carte, qui est propre à chaque bâtiment (−40 % de sa propre consommation mesurée). Nuance sur ce −40 % : faute de consommation de référence historique disponible (ex. année 2010, comme l'exige le vrai Décret tertiaire), il est calculé sur la consommation actuelle du bâtiment elle-même — une approximation, pas l'application stricte de la méthode réglementaire.${statusDpe}`,
      dpeDate: batiment.derniere_maj ?? undefined,
      suivi: "non commencé (pas d'outil de mesure continue à ce jour)",
    },
  };
}
