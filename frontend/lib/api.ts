const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type OrigineDonnee = "mesuree" | "documentee" | "hypothese";
export type EtatCouple = "deja_realise" | "applicable" | "non_applicable" | "donnees_insuffisantes";

export interface Batiment {
  id: number;
  nom: string;
  arrondissement: string;
  statut_patrimonial: string;
  annee_construction: number | null;
  surface_m2: number | null;
  energie_principale: string | null;
  conso_mesuree_kwh_m2: number | null;
  conso_origine: OrigineDonnee;
  dpe: string | null;
  orientation_vitrage_dominante: string | null;
  type_isolation: string | null;
  couverture_donnees_pct: number | null;
  derniere_maj: string | null;
}

export interface Score {
  risque: number;
  urgence: number;
  faisabilite: number;
  sct: number;
}

export interface Levier {
  id: number;
  nom: string;
  poste_concerne: string;
  gain_min_pct: number;
  gain_max_pct: number;
  source: string;
}

export interface LigneLevierBatiment {
  levier: Levier;
  etat: EtatCouple;
  gain_indicatif_pct: number | null;
  commentaire: string | null;
}

export interface LigneBatimentLevier {
  batiment: Batiment;
  etat: EtatCouple;
  gain_indicatif_pct: number | null;
  commentaire: string | null;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Erreur API ${path} : ${res.status}`);
  }
  return res.json();
}

export function getBatiments() {
  return fetchJson<{ batiment: Batiment; score: Score }[]>("/batiments");
}

export function getBatiment(id: number) {
  return fetchJson<{ batiment: Batiment; score: Score; leviers: LigneLevierBatiment[] }>(
    `/batiments/${id}`
  );
}

export function getLeviers() {
  return fetchJson<Levier[]>("/leviers");
}

export function getBatimentsPourLevier(levierId: number) {
  return fetchJson<{ levier: Levier; batiments: LigneBatimentLevier[] }>(
    `/leviers/${levierId}/batiments`
  );
}

export interface Indicateurs {
  conso_moyenne_ponderee_kwh_m2: number;
  ecart_moyen_objectif_2030_pct: number;
  nb_batiments_qualifies_3_leviers: number;
  nb_batiments_documentes: number;
  gain_potentiel_moyen_pct: number;
  objectif_2030_kwh_m2: number;
  classement_ecart_objectif: { batiment: Batiment; ecart_pct: number }[];
}

export function getIndicateurs() {
  return fetchJson<Indicateurs>("/indicateurs");
}

export function priorite(sct: number): "elevee" | "moyenne" | "faible" {
  if (sct >= 65) return "elevee";
  if (sct >= 40) return "moyenne";
  return "faible";
}
