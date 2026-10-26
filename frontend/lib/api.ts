// Donnees de demonstration figees a la generation (voir backend/app/seed.py et
// frontend/data/*.json). Pas d'appel reseau : ce frontend est deploye en autonome
// pour une demo publique, sans backend a heberger. Pour retrouver le mode "API vivante"
// en developpement local, voir git history de ce fichier (fetch vers NEXT_PUBLIC_API_URL).

import batimentsData from "@/data/batiments.json";
import indicateursData from "@/data/indicateurs.json";
import leviersData from "@/data/leviers.json";

import batiment2 from "@/data/batiment/2.json";
import batiment7 from "@/data/batiment/7.json";
import batiment9 from "@/data/batiment/9.json";
import batiment11 from "@/data/batiment/11.json";
import batiment12 from "@/data/batiment/12.json";
import batiment13 from "@/data/batiment/13.json";
import batiment14 from "@/data/batiment/14.json";
import batiment15 from "@/data/batiment/15.json";
import batiment16 from "@/data/batiment/16.json";
import batiment17 from "@/data/batiment/17.json";
import batiment18 from "@/data/batiment/18.json";

import levier1 from "@/data/levier/1.json";
import levier2 from "@/data/levier/2.json";
import levier3 from "@/data/levier/3.json";
import levier4 from "@/data/levier/4.json";
import levier5 from "@/data/levier/5.json";
import levier6 from "@/data/levier/6.json";

export type OrigineDonnee = "mesuree" | "documentee" | "hypothese";
export type EtatCouple = "deja_realise" | "applicable" | "non_applicable" | "donnees_insuffisantes";

export interface ConsommationEnergie {
  energie: string;
  conso_mesuree_kwh_m2: number | null;
  annee_mesure: number | null;
}

export interface VitrageEtage {
  niveau: string;
  surface_m2: number | null;
  nature: string | null;
}

export interface DocumentBatiment {
  label: string;
  url: string;
}

export interface AdresseRNB {
  numero: string | null;
  suffixe: string | null;
  rue: string;
  ville: string;
  code_postal: string;
}

export type OrientationFacade = "N" | "E" | "S" | "O" | "indeterminee";

export interface FacadeSegment {
  index: number;
  longueur_m: number;
  orientation: OrientationFacade;
  azimut_deg: number;
  bruit: boolean; // segment < 2m = jog/step d'emprise, pas une vraie façade
  // Estimation du taux de vitrage lue sur une élévation d'architecte (pas une
  // photo, pas une cote imprimée) : hauteur de bande vitrée / hauteur d'étage
  // réelle (cf. hauteurEtageReelle), comparées visuellement sur le plan.
  // Volontairement absent des segments non estimés (pas de valeur inventée).
  taux_vitrage_estime_pct: number | null;
  vitrage_origine: "estimee_plan" | "estimee_photo_description" | "estimee_bdnb_batiment" | null;
  vitrage_note: string | null;
  // Irradiance solaire annuelle reçue par cette façade (PVGIS, plan vertical,
  // azimut réel du segment), SANS correction par les masques solaires
  // (ombres des bâtiments voisins) — chantier séparé, voir NOTES_COURBES_HELIOTROPIQUES.md.
  irradiance_kwh_m2_an: number | null;
  // Même irradiance, corrigée des ombres portées par les bâtiments voisins
  // (PVGIS userhorizon, hauteurs APUR réelles) -- toujours <= irradiance_kwh_m2_an.
  irradiance_corrigee_kwh_m2_an: number | null;
}

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
  // Mise en garde courte affichée sous la consommation quand la donnée est
  // provisoire (ex. ambiguïté non résolue sur une source) -- null sinon,
  // jamais un champ vide "au cas où".
  conso_incertitude: string | null;
  annee_mesure: number | null;
  dpe: string | null;
  type_isolation: string | null;
  r_isolation_estime: number | null;
  consommations_secondaires: ConsommationEnergie[];
  nombre_etages: number | null;
  vitrages_par_etage: VitrageEtage[];
  nature_toiture: string | null;
  matiere_toiture: string | null;
  ouvertures_toiture: string | null;
  adresse: string | null;
  documents: DocumentBatiment[];
  derniere_maj: string | null;
  latitude: number | null;
  longitude: number | null;
  // Géométrie et adresse issues du RNB (Référentiel National des Bâtiments)
  // et de l'APUR (Emprise bâtie Paris) — voir stde_app/scripts/enrich_rnb_apur.py
  // et NOTES_COURBES_HELIOTROPIQUES.md. rnb_verifie=false tant que le segment
  // n'a pas été confirmé manuellement (un bâtiment peut être découpé en
  // plusieurs emprises voisines) ; dans ce cas les champs restent vides et ne
  // sont pas affichés en Caractéristiques.
  rnb_id: string | null;
  rnb_adresses: AdresseRNB[];
  rnb_verifie: boolean;
  hauteur_m: number | null;
  hauteur_min_m: number | null;
  hauteur_max_m: number | null;
  facade_segments: FacadeSegment[];
  facade_source: "rnb" | "apur" | "ign_bdtopo" | null;
  // Explication d'un écart hauteur/nombre d'étages jugé normal après
  // vérification manuelle (ex. Buffon : bibliothèque = étages hauts d'un
  // bâtiment partagé avec une école) -- absent quand aucun écart notable
  // n'a été creusé.
  hauteur_verification: { statut: string; note: string } | null;
  // Source de hauteur_m, distincte de facade_source (qui documente la
  // longueur des façades, pas la hauteur) -- une façade peut venir d'APUR
  // pendant que la hauteur vient de TerraLab. "estimation" = pas une mesure
  // directe (bâtiment sans RNB confirmé), fiabilité à afficher comme faible.
  hauteur_origine: "apur" | "terralab" | "estimation" | null;
  // Factures réelles mensuelles (janv. 2023 - juin 2026, voir
  // stde_app/scripts/extract_consommation_mensuelle.py). Un mois absent du
  // tableau = aucune facture reçue ce mois-là (pas une consommation nulle) —
  // ne jamais combler silencieusement un trou.
  consommations_mensuelles: ConsommationMensuelle[];
}

export interface ConsommationMensuelle {
  mois: string; // "YYYY-MM"
  energie: string; // "Électricité" | "Gaz" | "Vapeur"
  kwh: number;
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

const batimentDetails: Record<
  number,
  { batiment: Batiment; leviers: LigneLevierBatiment[] }
> = {
  2: batiment2 as any,
  7: batiment7 as any,
  9: batiment9 as any,
  11: batiment11 as any,
  12: batiment12 as any,
  13: batiment13 as any,
  14: batiment14 as any,
  15: batiment15 as any,
  16: batiment16 as any,
  17: batiment17 as any,
  18: batiment18 as any,
};

const levierBatiments: Record<number, { levier: Levier; batiments: LigneBatimentLevier[] }> = {
  1: levier1 as any,
  2: levier2 as any,
  3: levier3 as any,
  4: levier4 as any,
  5: levier5 as any,
  6: levier6 as any,
};

export async function getBatiments() {
  return batimentsData as { batiment: Batiment }[];
}

export async function getBatiment(id: number) {
  return batimentDetails[id];
}

export async function getLeviers() {
  return leviersData as Levier[];
}

export async function getBatimentsPourLevier(levierId: number) {
  return levierBatiments[levierId];
}

export interface Indicateurs {
  conso_moyenne_ponderee_kwh_m2: number;
  ecart_moyen_objectif_2030_kwh_m2: number;
  nb_batiments_qualifies_3_leviers: number;
  nb_batiments_documentes: number;
  gain_potentiel_moyen_pct: number;
  objectif_2030_kwh_m2: number;
  classement_ecart_objectif: { batiment: Batiment; ecart_kwh_m2: number }[];
}

export async function getIndicateurs() {
  return indicateursData as Indicateurs;
}

export function priorite(sct: number): "elevee" | "moyenne" | "faible" {
  if (sct >= 65) return "elevee";
  if (sct >= 40) return "moyenne";
  return "faible";
}

// Portage fidele de stde_app/backend/app/scoring.py (jamais branche sur cette
// app figee) -- affiche seulement sur la fiche bâtiment pour l'instant, pas
// utilisé pour le tri/les couleurs de l'accueil/carte/sidebar (qui restent
// sur l'ancien score.sct stocké, volontairement non touchés ici). Aucune
// valeur par défaut inventée si une donnée manque : null plutôt qu'un
// chiffre plausible.
const DPE_RISQUE: Record<string, number> = { A: 10, B: 25, C: 40, D: 55, E: 70, F: 85, G: 100 };
const OBJECTIF_2030_SCORING_KWH_M2 = 128; // constante du moteur de score (scoring.py), distincte de objectifConso

export function scoreRisque(batiment: Batiment): number | null {
  const dpeScore = batiment.dpe ? DPE_RISQUE[batiment.dpe.toUpperCase()] ?? null : null;
  let ecartScore: number | null = null;
  if (batiment.conso_mesuree_kwh_m2) {
    const ecartPct = ((batiment.conso_mesuree_kwh_m2 - OBJECTIF_2030_SCORING_KWH_M2) / OBJECTIF_2030_SCORING_KWH_M2) * 100;
    ecartScore = Math.max(0, Math.min(100, 50 + ecartPct));
  }
  if (dpeScore == null && ecartScore == null) return null;
  if (dpeScore == null) return Math.round(ecartScore! * 10) / 10;
  if (ecartScore == null) return dpeScore;
  return Math.round(((dpeScore + ecartScore) / 2) * 10) / 10;
}

export function scoreFaisabilite(batiment: Batiment): number {
  const statut = (batiment.statut_patrimonial || "").toLowerCase();
  if (statut.includes("aucune") || statut === "") return 90;
  if (statut.includes("plu")) return 70;
  if (statut.includes("inscrit")) return 45;
  if (statut.includes("classe") || statut.includes("classé")) return 25;
  return 60;
}

// Objectif = consommation de référence − 40 % (acté avec Jean en réunion :
// référence 100 kW/m²·an → objectif 60 kW/m²·an).
export function objectifConso(reference: number | null): number | null {
  return reference == null ? null : Math.round(reference * 0.6);
}

// Écart absolu (kWh/m²·an) à l'objectif -40% propre au bâtiment -- remplace
// l'ancien écart en % contre un seuil fixe (128), qui ne représentait aucune
// vraie référence commune et rendait le % toujours identique si on le
// comparait à l'objectif du bâtiment lui-même (conso - 0,6*conso = 0,4*conso,
// une constante proportionnelle, pas un vrai écart comparatif).
export function ecartKwhM2(batiment: Batiment): number | null {
  const objectif = objectifConso(batiment.conso_mesuree_kwh_m2);
  return batiment.conso_mesuree_kwh_m2 == null || objectif == null
    ? null
    : Math.round(batiment.conso_mesuree_kwh_m2 - objectif);
}

// Hauteur d'étage réelle (mesurée via APUR ÷ nombre d'étages du DPE), pas la
// valeur par défaut de 3m utilisée en l'absence de mesure — sert de
// dénominateur fiable pour estimer un taux de vitrage à partir d'une
// proportion lue sur un plan (cf. NOTES_COURBES_HELIOTROPIQUES.md).
export function hauteurEtageReelle(batiment: Batiment): number | null {
  if (batiment.hauteur_m == null || !batiment.nombre_etages) return null;
  return Math.round((batiment.hauteur_m / batiment.nombre_etages) * 100) / 100;
}

// Apport solaire annuel d'une façade (kWh/an) = surface vitrée × irradiance
// corrigée des masques solaires. Dernière étape du pipeline "courbes
// héliotropiques" (voir BILAN_COURBES_HELIOTROPIQUES.md) — null tant que les
// 3 briques (hauteur du bâtiment, taux de vitrage estimé, irradiance
// corrigée) ne sont pas toutes renseignées, jamais de valeur inventée.
export function apportSolaireFacade(batiment: Batiment, facade: FacadeSegment): number | null {
  if (
    batiment.hauteur_m == null ||
    facade.taux_vitrage_estime_pct == null ||
    facade.irradiance_corrigee_kwh_m2_an == null
  ) {
    return null;
  }
  const surfaceFacade = facade.longueur_m * batiment.hauteur_m;
  const surfaceVitree = surfaceFacade * (facade.taux_vitrage_estime_pct / 100);
  return Math.round(surfaceVitree * facade.irradiance_corrigee_kwh_m2_an);
}

// Apport solaire total du bâtiment (kWh/an), somme sur toutes les façades réelles
// (bruit exclu) ayant un apport calculable. null si aucune façade n'a de vitrage
// estimé — pas de valeur partielle trompeuse.
export function apportSolaireTotal(batiment: Batiment): number | null {
  const apports = batiment.facade_segments
    .filter((f) => !f.bruit)
    .map((f) => apportSolaireFacade(batiment, f))
    .filter((v): v is number => v != null);
  if (apports.length === 0) return null;
  return apports.reduce((s, v) => s + v, 0);
}

// Urgence = apport solaire réel par m², normalisé entre le bâtiment le moins et le
// plus exposé parmi les seuls bâtiments où l'apport solaire est intégralement
// calculable (façades + vitrage + irradiance corrigée des masques). Calibré le
// 03/09/2026 sur 4 bâtiments (min Oscar Wilde 17,7 kWh/an/m², max Jean-Pierre
// Melville 179,0 kWh/an/m²) -- échelle purement relative entre ces 4 connus, aucun
// seuil absolu documenté n'existe pour "l'apport solaire acceptable" par m². À
// recalculer si Jean fournit le vitrage manquant pour d'autres bâtiments (voir
// 21_CHANTIERS_OUVERTS_ET_BLOCAGES.md). null pour tout bâtiment sans vitrage estimé
// (7 bâtiments sur 11 actuellement) -- jamais de proxy plus faible mélangé ici.
const URGENCE_APPORT_MIN_KWH_M2 = 17.7;
const URGENCE_APPORT_MAX_KWH_M2 = 179.0;

export function scoreUrgence(batiment: Batiment): number | null {
  const total = apportSolaireTotal(batiment);
  if (total == null || !batiment.surface_m2) return null;
  const parM2 = total / batiment.surface_m2;
  const pct =
    ((parM2 - URGENCE_APPORT_MIN_KWH_M2) / (URGENCE_APPORT_MAX_KWH_M2 - URGENCE_APPORT_MIN_KWH_M2)) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
}

export interface PrioriteGlobale {
  valeur: number;
  criteres: ("risque" | "urgence" | "faisabilite")[]; // ceux effectivement utilisés
}

// Priorité affichée sur l'accueil/carte/sidebar (03/09/2026) — remplace l'ancien
// score.sct figé (9 bâtiments sur 11 partageaient la même valeur fictive). Risque
// est obligatoire (poids dominant, seul vrai proxy de surconsommation) : sans lui,
// pas de priorité affichée du tout, même logique que le gris "non documenté" déjà
// utilisé partout ailleurs pour conso_mesuree_kwh_m2 null. Urgence, quand
// disponible, s'ajoute avec son poids normal (30%) ; quand absente, les poids de
// Risque et Faisabilité sont renormalisés proportionnellement (0,5/0,7 et 0,2/0,7)
// plutôt que de traiter l'absence de donnée comme une mauvaise note.
export function prioriteGlobale(batiment: Batiment): PrioriteGlobale | null {
  const risque = scoreRisque(batiment);
  if (risque == null) return null;
  const urgence = scoreUrgence(batiment);
  const faisabilite = scoreFaisabilite(batiment);
  const criteres: PrioriteGlobale["criteres"] = ["risque", "faisabilite"];
  let valeur: number;
  if (urgence != null) {
    criteres.splice(1, 0, "urgence");
    valeur = risque * 0.5 + urgence * 0.3 + faisabilite * 0.2;
  } else {
    valeur = risque * (0.5 / 0.7) + faisabilite * (0.2 / 0.7);
  }
  return { valeur: Math.round(valeur * 10) / 10, criteres };
}

// Détection climatisation sur facture électrique : méthode proposée par Jean
// Rolland (réunion du 28/08/2026, voir NOTES_METHODE_DPE_VS_3CL_ET_MARGE_INCERTITUDE.md)
// — en l'absence de fiche équipement fiable, une hausse de la conso électrique
// l'été (juin-août) par rapport à l'hiver (déc-févr) est le seul indice
// disponible sur facture. Seuil +10% choisi pour ignorer le bruit normal,
// pas calibré statistiquement (peu de bâtiments, à affiner si plus de
// données arrivent). Signal, pas une confirmation par équipement — voir
// /etat-du-projet.
const MOIS_ETE = [6, 7, 8];
const MOIS_HIVER = [12, 1, 2];

export function climatisationDetectee(
  batiment: Batiment
): { moyEte: number; moyHiver: number; ecartPct: number } | null {
  const ete: number[] = [];
  const hiver: number[] = [];
  for (const c of batiment.consommations_mensuelles) {
    if (c.energie !== "Électricité") continue;
    const mois = parseInt(c.mois.split("-")[1], 10);
    if (MOIS_ETE.includes(mois)) ete.push(c.kwh);
    if (MOIS_HIVER.includes(mois)) hiver.push(c.kwh);
  }
  if (ete.length === 0 || hiver.length === 0) return null;
  const moyEte = ete.reduce((s, v) => s + v, 0) / ete.length;
  const moyHiver = hiver.reduce((s, v) => s + v, 0) / hiver.length;
  const ecartPct = Math.round(((moyEte - moyHiver) / moyHiver) * 1000) / 10;
  if (moyEte <= moyHiver * 1.1) return null;
  return { moyEte: Math.round(moyEte), moyHiver: Math.round(moyHiver), ecartPct };
}

// Un 0 déclaré de chauffage (Gaz/Vapeur) est normal hors saison de chauffe
// (mai-septembre, chauffage coupé). Un 0 d'Électricité, ou un 0 de chauffage
// en pleine saison de chauffe, n'est pas physiquement crédible pour un
// bâtiment en activité — plus probablement une facture pas encore reçue au
// moment de l'export, enregistrée par défaut à 0, qu'une vraie absence de
// consommation. On le signale, on ne l'affirme pas.
const SAISON_MORTE_CHAUFFAGE = [5, 6, 7, 8, 9];

export function zeroEstSuspect(kwh: number, mois: string, energie: string): boolean {
  if (kwh !== 0) return false;
  if (energie === "Électricité") return true;
  const m = parseInt(mois.split("-")[1], 10);
  return !SAISON_MORTE_CHAUFFAGE.includes(m);
}

// Reconstruit le contour 2D (mètres, repère local) en marchant le long des
// façades dans l'ordre (longueur + azimut de la normale sortante), formule
// déduite de la génération dans enrich_rnb_apur.py. L'app ne stocke pas le
// contour brut APUR — seulement les segments — donc c'est la seule source
// disponible pour un volume 3D. Testé sur les 7 bâtiments qualifiés : le
// contour se referme avec un résidu de 0 à 5,6 % du périmètre (rounding sur
// azimut/longueur à 1-2 décimales) ; au-delà de 15 % on considère la
// reconstruction non fiable et on renvoie null plutôt qu'un volume déformé.
export function reconstruitContour(batiment: Batiment): [number, number][] | null {
  if (!batiment.rnb_verifie || batiment.facade_segments.length === 0) return null;
  const segs = [...batiment.facade_segments].sort((a, b) => a.index - b.index);
  const walk = (flip: boolean): [number, number][] => {
    let x = 0;
    let y = 0;
    const pts: [number, number][] = [[0, 0]];
    for (const s of segs) {
      const rad = (s.azimut_deg * Math.PI) / 180;
      const dx = (flip ? -1 : 1) * s.longueur_m * Math.cos(rad);
      const dy = (flip ? 1 : -1) * s.longueur_m * Math.sin(rad);
      x += dx;
      y += dy;
      pts.push([x, y]);
    }
    return pts;
  };
  const perimetre = segs.reduce((s, seg) => s + seg.longueur_m, 0);
  if (perimetre === 0) return null;
  const residu = (pts: [number, number][]) =>
    Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
  const candidats = [walk(false), walk(true)].sort((a, b) => residu(a) - residu(b));
  const meilleur = candidats[0];
  if (residu(meilleur) / perimetre > 0.15) return null;
  meilleur[meilleur.length - 1] = meilleur[0];
  return meilleur;
}

// Aire et périmètre réels du contour reconstruit (formule du lacet / shoelace) --
// partagés entre Batiment3D.tsx et FicheMap.tsx pour ne pas dupliquer le calcul.
export function aireEtPerimetreContour(contour: [number, number][]): { area: number; perimetre: number } {
  let aire = 0;
  let perimetre = 0;
  for (let i = 0; i < contour.length - 1; i++) {
    const [x1, y1] = contour[i];
    const [x2, y2] = contour[i + 1];
    aire += x1 * y2 - x2 * y1;
    perimetre += Math.hypot(x2 - x1, y2 - y1);
  }
  return { area: Math.abs(aire) / 2, perimetre };
}
