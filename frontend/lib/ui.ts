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

export const ETAT_LABEL: Record<EtatCouple, string> = {
  deja_realise: "Déjà réalisé",
  applicable: "Applicable",
  non_applicable: "Non applicable",
  donnees_insuffisantes: "Données insuffisantes",
};

export const ETAT_CLASS: Record<EtatCouple, string> = {
  deja_realise: "s-ok",
  applicable: "s-app",
  non_applicable: "s-non",
  donnees_insuffisantes: "s-ins",
};

export const ORIGINE_LABEL: Record<string, string> = {
  mesuree: "Constatée",
  documentee: "Documentée",
  hypothese: "Hypothèse",
};

export const ORIGINE_CLASS: Record<string, string> = {
  mesuree: "t-mes",
  documentee: "t-doc",
  hypothese: "t-hyp",
};
