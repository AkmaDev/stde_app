import { EtatCouple } from "@/lib/api";

export const PRIORITE_LABEL: Record<string, string> = {
  elevee: "Élevée",
  moyenne: "Moyenne",
  faible: "Faible",
};

export const PRIORITE_DOT: Record<string, string> = {
  elevee: "r",
  moyenne: "o",
  faible: "g",
};

// Version hex de la même table, pour les endroits (carte Leaflet) qui ne peuvent
// pas passer par une classe CSS. Garder synchronisée avec PRIORITE_DOT ci-dessus.
export const PRIORITE_HEX: Record<string, string> = {
  elevee: "#C0503F",
  moyenne: "#D98C2B",
  faible: "#3E9E6E",
};

// Gris "données insuffisantes" — même état que le point/pin grisé déjà utilisé
// pour un bâtiment sans conso mesurée, étendu à tout bâtiment sans Risque calculable.
export const COULEUR_INSUFFISANTE = "#B7C4CA";

// Forme en plus de la couleur sur chaque badge de priorité (RGAA 3.2 — ne
// jamais coder une information uniquement par la couleur, pour rester lisible
// en daltonisme). Synchronisé avec PRIORITE_HEX/PRIORITE_LABEL ci-dessus.
export const PRIORITE_SHAPE: Record<string, string> = {
  elevee: "▲",
  moyenne: "◆",
  faible: "●",
};
export const FORME_INSUFFISANTE = "◌";

export const CRITERES_LABEL: Record<string, string> = {
  risque: "Risque",
  urgence: "Urgence",
  faisabilite: "Faisabilité",
};

export const ETAT_LABEL: Record<EtatCouple, string> = {
  deja_realise: "Déjà réalisé",
  applicable: "Applicable",
  non_applicable: "Exclusion",
  donnees_insuffisantes: "Données insuffisantes",
};

export const ETAT_CLASS: Record<EtatCouple, string> = {
  deja_realise: "s-ok",
  applicable: "s-app",
  non_applicable: "s-non",
  donnees_insuffisantes: "s-ins",
};

// 4e état préparé pour les futures recommandations IA (pas encore utilisé par
// aucun composant tant qu'aucune vraie suggestion IA n'existe dans les
// données — jamais de donnée inventée juste pour remplir cette case).
export const ORIGINE_LABEL: Record<string, string> = {
  mesuree: "Constatée",
  documentee: "Documentée",
  hypothese: "Hypothèse",
  suggeree_ia: "Suggérée par IA",
  // Valeur vide : évite le badge trompeur "Documentée" sur un champ non
  // renseigné (bug repéré le 08/09, corrigé le 18/09 — voir page.tsx).
  absente: "—",
};

export const ORIGINE_CLASS: Record<string, string> = {
  mesuree: "t-mes",
  documentee: "t-doc",
  hypothese: "t-hyp",
  suggeree_ia: "t-ia",
  absente: "t-abs",
};
