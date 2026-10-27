// Registre méthodologique réel par champ, pour l'écran Documentation
// (/documentation/[id]). Reconstruit à partir des phrases réelles déjà
// écrites dans l'ancien app/batiments/[id]/page.tsx (DPE_GENERIQUE,
// noteHauteur, noteConso, vitrage_note...) -- pas de contenu inventé. Un
// champ dont on n'a pas de méthode réelle à décrire dit "méthode précise non
// retracée cette session", jamais une procédure plausible mais fausse.
import { Batiment, FacadeSegment } from "./api";

export type FieldDoc = {
  src: string | null; // libellé du document source (ou null si calcul)
  ref: string;
  meth: string;
  fiab: string;
  steps: string[];
  lim?: string;
  expect?: string;
};

const NON_RETRACE = "Donnée reprise du dossier reçu pour ce bâtiment ; document et page source précis non retracés cette session.";

// Un DPE realise avant 2013 est legalement expire depuis le 31/12/2022
// (reforme DPE 2021, duree de validite raccourcie pour les anciennes
// methodes de calcul) -- annee lue dans le libelle du document DPE deja
// liste pour ce batiment, jamais une date inventee.
export function dpeExpireLim(batiment: Batiment): string | undefined {
  const doc = batiment.documents.find((d) => d.label.includes("DPE"));
  if (!doc) return undefined;
  const annee = doc.label.match(/\((\d{4})/)?.[1];
  if (!annee || Number(annee) >= 2013) return undefined;
  return `DPE de ${annee} : légalement expiré depuis le 31/12/2022 (réforme DPE 2021, durée de validité raccourcie pour les DPE réalisés avant 2013). Utilisé quand même faute d'alternative, aucun nouveau DPE n'a été commandé pour ce bâtiment à ce jour.`;
}

const LIM_MIN_MAX_APUR =
  "hauteur_min_m/hauteur_max_m restent issus d'APUR (fourchette sur l'emprise) -- TerraLab ne donne qu'une valeur unique, pas la même source que hauteur_m.";

function combineLim(...parts: (string | null | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join(" ") : undefined;
}

function hauteurDoc(batiment: Batiment): FieldDoc {
  if (batiment.hauteur_origine === "terralab") {
    return {
      src: "TerraLab (IGN BD TOPO)",
      ref: "Hauteur du bâtiment, du sol à la gouttière",
      meth: "Open data",
      fiab: "Élevée",
      steps: ["Hauteur relevée directement sur TerraLab (terra-lab.ai), outil basé sur l'IGN BD TOPO, le 26/10/2026."],
      lim: combineLim(LIM_MIN_MAX_APUR, batiment.hauteur_verification?.note),
    };
  }
  if (batiment.hauteur_origine === "estimation") {
    return {
      src: "TerraLab + Google Earth",
      ref: "Comparaison visuelle, pas de RNB confirmé",
      meth: "Estimation visuelle",
      fiab: "Faible",
      steps: ["Bâtiment sans identifiant RNB confirmé -- hauteur estimée par comparaison visuelle sur TerraLab et Google Earth, pas une mesure directe."],
      lim: combineLim(LIM_MIN_MAX_APUR, batiment.hauteur_verification?.note),
    };
  }
  const src =
    batiment.facade_source === "ign_bdtopo"
      ? "IGN BDTOPO"
      : batiment.facade_source === "apur"
      ? "APUR — EMPRISE_BATIE_PARIS"
      : "APUR";
  const steps = [
    batiment.facade_source === "ign_bdtopo"
      ? "Lien direct par identifiant RNB (utilisé pour ce bâtiment après ambiguïté APUR sur sa parcelle)."
      : "Rapprochement de l'emprise APUR avec l'identifiant RNB du bâtiment, champ hauteur.",
  ];
  return {
    src,
    ref: "Champ hauteur de l'emprise",
    meth: "Open data",
    fiab: "Élevée",
    steps,
    lim: batiment.hauteur_verification?.note,
  };
}

export function getFieldDoc(code: string, batiment: Batiment): FieldDoc {
  if (code === "A.1") {
    return { src: "DPE", ref: "Descriptif général", meth: "Extraction manuelle", fiab: "Élevée", steps: ["Lecture du champ « Année de construction » du descriptif général du DPE."] };
  }
  if (code === "A.2") {
    const statut = batiment.statut_patrimonial;
    if (batiment.id === 2) {
      return {
        src: null,
        ref: "Proximité Jardin des Plantes",
        meth: "Déduction qualitative",
        fiab: "Faible",
        steps: ["Aucune mention dans les documents reçus.", "Déduit de la proximité du Jardin des Plantes, classé monument historique depuis 1993 (avis ABF probable pour covisibilité)."],
        lim: "À confirmer directement auprès des Bâtiments de France.",
      };
    }
    if (statut && statut !== "Aucune contrainte") {
      return { src: "Données projet", ref: statut, meth: "Extraction manuelle", fiab: "Moyenne", steps: [NON_RETRACE] };
    }
    return { src: "PLU de Paris", ref: "Protections patrimoniales", meth: "Croisement géographique", fiab: "Élevée", steps: ["Aucune protection patrimoniale identifiée sur l'emprise du bâtiment."] };
  }
  if (code === "B.1" || code === "B.2") {
    return { src: "DPE", ref: "Descriptif général", meth: "Extraction manuelle", fiab: "Élevée", steps: ["Lecture de la valeur déclarée dans le descriptif général du DPE."] };
  }
  if (code === "C.1") return hauteurDoc(batiment);
  if (code === "C.2") {
    const limBase = "Ne tient pas compte des niveaux de hauteur différente (rez-de-chaussée, combles) — pas une mesure directe.";
    const noteBatiment = batiment.hauteur_verification?.note;
    return {
      src: null,
      ref: "C.1 ÷ B.1",
      meth: "Calcul",
      fiab: "Moyenne",
      steps: ["Division de la hauteur du bâtiment (C.1) par le nombre d'étages (B.1)."],
      lim: noteBatiment ? `${limBase} ${noteBatiment}` : limBase,
    };
  }
  if (code.startsWith("C.") && code !== "C.1" && code !== "C.2") {
    return { src: "RNB", ref: "Répertoire National des Bâtiments", meth: "Identifiant vérifié", fiab: "Élevée", steps: ["Rapprochement manuel de l'adresse avec le bâtiment correspondant dans le RNB."] };
  }
  if (code === "D.1") {
    return {
      src: "DPE",
      ref: "Commentaires du diagnostiqueur",
      meth: "Déduction qualitative",
      fiab: "Faible",
      steps: ["Lecture des commentaires du diagnostiqueur sur l'état des parois.", "Classement qualitatif (ex. levier « Isolation façade »)."],
      lim: "Hypothèse : aucune mesure in situ de l'isolant n'a été réalisée.",
    };
  }
  if (code === "D.2") {
    if (!batiment.nature_toiture) {
      return { src: null, ref: "—", meth: "Non documentée", fiab: "—", steps: [NON_RETRACE] };
    }
    return { src: "DPE", ref: "§ 5.7 — Toiture", meth: "Extraction manuelle", fiab: "Élevée", steps: ["Lecture de la section 5.7 (type et description du complexe de toiture) du DPE."] };
  }
  if (code === "D.3") {
    if (!batiment.matiere_toiture) {
      return { src: null, ref: "—", meth: "Non documentée", fiab: "—", steps: [NON_RETRACE] };
    }
    return { src: "DPE", ref: "§ 5.7 — Toiture", meth: "Extraction manuelle", fiab: "Élevée", steps: ["Lecture de la section 5.7 (type et description du complexe de toiture) du DPE."] };
  }
  if (code === "D.4") {
    return { src: null, ref: "Dossier reçu", meth: "Extraction manuelle", fiab: "Moyenne", steps: [NON_RETRACE] };
  }
  if (code === "D.5") {
    return { src: null, ref: "—", meth: "Non collectée", fiab: "—", steps: ["Retiré le 08/09 : aucune source retrouvée (ni DPE, ni document projet, ni script)."], expect: "Audit énergétique ou CCTP des travaux d'isolation." };
  }
  if (code.startsWith("D.")) {
    return { src: "DPE", ref: "Section 3.2.1 — Tableau des baies vitrées", meth: "Extraction manuelle", fiab: "Élevée", steps: ["Lecture du tableau des baies vitrées par niveau dans le DPE."] };
  }
  if (code === "F.1" || code === "F.2") {
    return { src: "DPE", ref: "Descriptif général / étiquette énergie", meth: "Extraction manuelle", fiab: "Élevée", steps: ["Lecture de la valeur déclarée dans le DPE."], lim: dpeExpireLim(batiment) };
  }
  if (code === "F.3") {
    const src = batiment.conso_origine === "mesuree" ? "Factures d'énergie, moyenne glissante sur années complètes" : "DPE";
    return {
      src,
      ref: batiment.conso_origine === "mesuree" ? "Relevés transmis par la maîtrise d'ouvrage" : "Consommation conventionnelle (étiquette énergie)",
      meth: batiment.conso_origine === "mesuree" ? "Moyenne glissante sur années complètes" : "Extraction manuelle",
      fiab: batiment.conso_origine === "mesuree" ? "Élevée" : "Moyenne",
      steps:
        batiment.conso_origine === "mesuree"
          ? [
              "Import du fichier de factures mensuelles (Excel, janvier 2023 à juin 2026).",
              "Pour chaque année calendaire parmi 2023, 2024, 2025 : elle n'est retenue que si CHAQUE énergie déjà vue pour ce bâtiment (pas une seule) a bien ses 12 mois facturés cette année-là — une énergie qui cesse d'être facturée (compteur, changement de fournisseur…) ne doit pas passer inaperçue parce qu'une autre énergie reste complète.",
              "Pour chaque année ainsi retenue : somme des kWh de toutes les énergies, en excluant les mois à 0 kWh suspects (facture manquante probable plutôt que consommation réellement nulle).",
              "Moyenne de ces totaux annuels, divisée par la surface de référence.",
              "2026 est exclue du calcul : les relevés s'arrêtent en juin 2026, donc seulement 6 des 12 mois sont facturés — une moyenne annuelle sur cette base sous-estimerait la consommation réelle de l'année.",
              "L'« Objectif 2030 » et l'écart affichés ailleurs (fiche, accueil, Indicateurs, carte) sont dérivés de cette même valeur, sans donnée supplémentaire : objectif = cette consommation × 0,6 (−40 %), écart = cette consommation − l'objectif.",
              "Nuance : faute de consommation de référence historique disponible (ex. année 2010, comme l'exige le vrai Décret tertiaire), cet objectif −40 % est calculé sur la consommation actuelle du bâtiment elle-même, pas sur une année de référence fixe. Ce n'est donc qu'une approximation de la méthode réglementaire, pas son application stricte.",
            ]
          : ["Lecture de la consommation conventionnelle sur l'étiquette énergie du DPE."],
      lim: batiment.conso_incertitude ?? undefined,
    };
  }
  if (code.startsWith("F.")) {
    return { src: "Factures d'énergie 2023-2026", ref: "Relevés transmis par la maîtrise d'ouvrage", meth: "Agrégation de relevés", fiab: "Élevée", steps: ["Import du fichier de factures.", "Somme des kWh facturés par énergie secondaire."] };
  }
  return { src: null, ref: "—", meth: "Non documentée", fiab: "—", steps: [NON_RETRACE] };
}

export function getFacadeFieldDoc(sousCode: "E.1" | "E.2" | "E.3" | "E.4" | "E.5", batiment: Batiment): FieldDoc {
  if (sousCode === "E.1") {
    return hauteurDoc(batiment).src
      ? { src: hauteurDoc(batiment).src, ref: "Segment de l'emprise bâtie", meth: "Open data", fiab: "Élevée", steps: ["Longueur du segment d'emprise correspondant à cette façade (APUR/RNB)."] }
      : { src: null, ref: "—", meth: "Non documentée", fiab: "—", steps: [NON_RETRACE] };
  }
  if (sousCode === "E.2") {
    return { src: null, ref: "Azimut du segment", meth: "Calcul géométrique", fiab: "Élevée", steps: ["Azimut du segment d'emprise, arrondi au point cardinal le plus proche."] };
  }
  if (sousCode === "E.3") {
    const facades = batiment.facade_segments.filter((f) => !f.bruit && f.vitrage_note);
    const origines = new Set(facades.map((f) => f.vitrage_origine));
    // Cas particulier : une seule valeur BDNB, moyenne de tout le bâtiment,
    // appliquée identiquement à chaque façade faute de donnée par orientation
    // -- à distinguer clairement des estimations faites façade par façade
    // (plan, photo), fiabilité affichée plus faible pour ne pas laisser croire
    // à une mesure par orientation.
    const estBdnbSeul = origines.size === 1 && origines.has("estimee_bdnb_batiment");
    const src =
      origines.size === 0
        ? null
        : estBdnbSeul
        ? "BDNB — moyenne du bâtiment entier"
        : origines.has("estimee_photo_description") && origines.has("estimee_plan")
        ? "Plans d'élévation + photos de rue"
        : origines.has("estimee_photo_description")
        ? "Photos de rue + description architecturale"
        : origines.has("estimee_plan")
        ? "Plans d'élévation"
        : "Open data (BDNB)";
    // Une note identique peut apparaitre sur plusieurs facades (ex. murs mitoyens) :
    // dedupe par texte tout en gardant le bon index de la premiere facade concernee
    // (un indexage par position, comme avant, decalait l'attribution des qu'une note
    // se repetait).
    const seen = new Set<string>();
    const steps: string[] = [];
    for (const f of facades) {
      const n = f.vitrage_note as string;
      if (seen.has(n)) continue;
      seen.add(n);
      steps.push(`Façade ${f.index} : ${n}`);
    }
    return {
      src,
      ref: estBdnbSeul ? "Moyenne bâtiment (BDNB)" : "Lecture d'élévations / estimation visuelle",
      meth: estBdnbSeul ? "Open data" : "Variable selon la façade",
      fiab: estBdnbSeul ? "Faible" : "Moyenne",
      steps: steps.length > 0 ? steps : [NON_RETRACE],
      lim: estBdnbSeul
        ? "Valeur unique BDNB pour tout le bâtiment (toutes orientations confondues), pas une mesure par façade — appliquée ici de façon identique à chaque façade, faute de donnée par orientation."
        : "La méthode diffère par façade (calcul sur cotes réelles vs estimation visuelle) — voir le détail ci-dessus.",
    };
  }
  if (sousCode === "E.4") {
    return {
      src: "PVGIS (Commission européenne)",
      ref: "Irradiation annuelle, plan vertical",
      meth: "Modélisation",
      fiab: "Moyenne",
      steps: ["Irradiation annuelle sur plan vertical pour l'orientation de la façade (PVGIS).", "Correction des masques solaires des bâtiments voisins (hauteurs APUR réelles, PVGIS userhorizon)."],
      lim: "Modèle annuel moyen, sans végétation.",
    };
  }
  return {
    src: null,
    ref: "E.1 × hauteur du bâtiment × E.3 × E.4",
    meth: "Calcul",
    fiab: "Moyenne",
    steps: ["Surface de façade = longueur (E.1) × hauteur du bâtiment (C.1).", "Surface vitrée = surface de façade × taux de vitrage (E.3).", "Irradiation reçue = surface vitrée × irradiation corrigée (E.4)."],
    lim: "N'intègre pas le facteur solaire du vitrage ni les protections existantes (stores) — mesure l'irradiation reçue par la surface vitrée, pas un gain thermique net. Un bâtiment déjà équipé de protections solaires efficaces apparaît donc aussi exposé qu'un bâtiment nu.",
  };
}
