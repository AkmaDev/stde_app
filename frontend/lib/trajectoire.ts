// Calcul de l'onglet « Trajectoire » : sépare la part chauffage (et
// climatisation) des factures mensuelles par signature énergétique, applique
// les leviers activés, et mesure l'avancement vers −40/−50/−60 %.
//
// Module sans import (types structurels compatibles avec lib/api.ts) pour
// pouvoir être testé directement par `node --test` (voir trajectoire.test.ts).
// Toutes les hypothèses sont listées dans HYPOTHESES et affichées dans la page.

export interface MoisMeteo {
  mois: string; // "YYYY-MM"
  tm: number;
  dju18: number;
  djc18: number;
  jours_mesures: number;
  jours_manquants: number;
}

export interface Facture {
  mois: string; // "YYYY-MM"
  energie: string;
  kwh: number;
}

export interface LevierSimulable {
  levier: { id: number; nom: string; poste_concerne: string; gain_min_pct: number; gain_max_pct: number; source: string };
  etat: "deja_realise" | "applicable" | "non_applicable" | "donnees_insuffisantes";
  commentaire: string | null;
}

export type Poste = "chauffage" | "climatisation" | "non_simule";

export const R2_MIN = 0.5;
export const MOIS_MIN_REGRESSION = 12;
export const PALIERS = [
  { annee: 2030, reduction: 0.4 },
  { annee: 2040, reduction: 0.5 },
  { annee: 2050, reduction: 0.6 },
];

// ---------- Année de référence ----------

// Dernière année civile dont les 12 mois apparaissent dans les factures
// (toutes énergies confondues) -- même règle que l'onglet Consommation.
export function derniereAnneeComplete(factures: Facture[]): string | null {
  const mois = Array.from(new Set(factures.map((f) => f.mois)));
  const annees = Array.from(new Set(mois.map((m) => m.slice(0, 4))));
  const completes = annees.filter((y) => mois.filter((m) => m.startsWith(y)).length === 12).sort();
  return completes.length ? completes[completes.length - 1] : null;
}

// Pour la trajectoire, chaque énergie doit avoir ses 12 factures : sinon la
// référence annuelle serait sous-estimée sans que personne le voie.
export function derniereAnneeCompleteToutesEnergies(factures: Facture[]): string | null {
  const energies = Array.from(new Set(factures.map((f) => f.energie)));
  const annees = Array.from(new Set(factures.map((f) => f.mois.slice(0, 4)))).sort().reverse();
  for (const y of annees) {
    const ok = energies.every((e) => new Set(factures.filter((f) => f.energie === e && f.mois.startsWith(y)).map((f) => f.mois)).size === 12);
    if (ok) return y;
  }
  return null;
}

// ---------- Signature énergétique ----------

// Énergies qui ne servent qu'au chauffage dans ces bibliothèques (hypothèse
// affichée). Pour elles, une droite talon + DJU ne colle pas : le chauffage
// est coupé l'été et démarre sous ~15 °C, d'où un talon négatif. La
// régression sert alors seulement de preuve du lien avec le froid.
export const ENERGIES_CHAUFFAGE_SEUL = ["Vapeur", "Gaz"];

export interface Signature {
  energie: string;
  methode: "signature" | "tout_chauffage";
  talonParJour: number; // kWh/jour hors chauffage et climatisation
  b: number; // kWh par degré-jour de chauffage
  c: number; // kWh par degré-jour de climatisation (0 si non modélisée)
  r2: number;
  nbMois: number;
  chauffageDetecte: boolean;
  climModelisee: boolean;
  raison: string | null; // pourquoi le chauffage n'est pas détecté
}

// Moindres carrés sans constante libre : y = X·beta. Élimination de Gauss
// sur les équations normales (2 ou 3 inconnues). Renvoie null si singulier.
function moindresCarres(X: number[][], y: number[]): number[] | null {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) A[r][c] += X[i][r] * X[i][c];
      A[r][k] += X[i][r] * y[i];
    }
  }
  for (let p = 0; p < k; p++) {
    let max = p;
    for (let r = p + 1; r < k; r++) if (Math.abs(A[r][p]) > Math.abs(A[max][p])) max = r;
    if (Math.abs(A[max][p]) < 1e-9) return null;
    [A[p], A[max]] = [A[max], A[p]];
    for (let r = 0; r < k; r++) {
      if (r === p) continue;
      const f = A[r][p] / A[p][p];
      for (let c = p; c <= k; c++) A[r][c] -= f * A[p][c];
    }
  }
  return A.map((row, i) => row[k] / row[i]);
}

function joursDuMois(mois: string): number {
  const [y, m] = mois.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// Régression kWh_mois = talon × jours + b × DJU18 (+ c × DJC18 si la
// climatisation est modélisée), sur les mois facturés dont la météo est
// complète. `exclure` retire les valeurs jugées non fiables (zéros suspects).
export function signatureEnergetique(
  energie: string,
  factures: Facture[],
  meteo: MoisMeteo[],
  avecClim: boolean,
  exclure: (f: Facture) => boolean = () => false,
  toutChauffage = false
): Signature {
  const methode = toutChauffage ? "tout_chauffage" : "signature";
  const meteoParMois = new Map(meteo.map((m) => [m.mois, m]));
  const points = factures.filter((f) => {
    if (f.energie !== energie || exclure(f)) return false;
    const mt = meteoParMois.get(f.mois);
    return mt != null && mt.jours_manquants === 0;
  });
  const vide = (raison: string): Signature => ({
    energie, methode, talonParJour: 0, b: 0, c: 0, r2: 0, nbMois: points.length,
    chauffageDetecte: false, climModelisee: false, raison,
  });
  if (points.length < MOIS_MIN_REGRESSION) {
    return vide(`seulement ${points.length} mois exploitables (minimum ${MOIS_MIN_REGRESSION})`);
  }
  const X = points.map((f) => {
    const mt = meteoParMois.get(f.mois)!;
    const ligne = [joursDuMois(f.mois), mt.dju18];
    if (avecClim) ligne.push(mt.djc18);
    return ligne;
  });
  const y = points.map((f) => f.kwh);
  const beta = moindresCarres(X, y);
  if (!beta) return vide("régression impossible (données trop régulières)");

  const [talonParJour, b, cBrut] = beta;
  const c = avecClim ? cBrut : 0;
  const moyenne = y.reduce((s, v) => s + v, 0) / y.length;
  const ssTot = y.reduce((s, v) => s + (v - moyenne) ** 2, 0);
  const ssRes = y.reduce((s, v, i) => {
    const pred = X[i].reduce((acc, x, j) => acc + x * beta[j], 0);
    return s + (v - pred) ** 2;
  }, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  let raison: string | null = null;
  // Tolérance d'arrondi : un talon nul sort parfois à −1e-13. Le talon n'est
  // pas utilisé en mode tout_chauffage, son signe n'y est donc pas contrôlé.
  if (!toutChauffage && talonParJour < -1e-6) raison = "talon négatif : décomposition non crédible";
  else if (b <= 0) raison = "la consommation n'augmente pas quand il fait froid";
  else if (r2 < R2_MIN) raison = `lien trop faible avec la température (R² = ${r2.toFixed(2)} < ${R2_MIN})`;

  return {
    energie, methode, talonParJour, b, c: c > 0 ? c : 0, r2, nbMois: points.length,
    chauffageDetecte: raison === null,
    climModelisee: avecClim && raison === null && c > 0,
    raison,
  };
}

// ---------- Décomposition d'un mois ----------

export interface PartsMois {
  mois: string;
  facture: number;
  chauffage: number;
  climatisation: number;
  talon: number;
  plafonne: boolean; // le modèle dépassait la facture : parts réduites à la facture
}

// La facture réelle est conservée : talon = facture − chauffage − clim. Si le
// modèle prévoit plus que la facture, chauffage et clim sont réduits au
// prorata pour ne jamais créer de consommation négative, et le mois est signalé.
export function decomposerMois(f: Facture, mt: MoisMeteo, s: Signature): PartsMois {
  if (s.methode === "tout_chauffage") {
    const chauffage = s.chauffageDetecte ? f.kwh : 0;
    return { mois: f.mois, facture: f.kwh, chauffage, climatisation: 0, talon: f.kwh - chauffage, plafonne: false };
  }
  let chauffage = s.chauffageDetecte ? s.b * mt.dju18 : 0;
  let climatisation = s.climModelisee ? s.c * mt.djc18 : 0;
  let plafonne = false;
  const total = chauffage + climatisation;
  if (total > f.kwh) {
    const k = total > 0 ? f.kwh / total : 0;
    chauffage *= k;
    climatisation *= k;
    plafonne = true;
  }
  return { mois: f.mois, facture: f.kwh, chauffage, climatisation, talon: f.kwh - chauffage - climatisation, plafonne };
}

// ---------- Leviers ----------

// Le poste se lit dans le libellé ADEME, pas dans l'identifiant du levier.
// « climatisation » passe avant « chauffage » (protection solaire : les deux
// sont cités, l'effet principal est le confort d'été).
export function posteDuLevier(posteConcerne: string): Poste {
  const p = posteConcerne.toLowerCase();
  if (p.includes("éclairage") || p.includes("eclairage")) return "non_simule";
  if (p.includes("climatisation")) return "climatisation";
  if (p.includes("chauffage")) return "chauffage";
  return "non_simule";
}

// Cumul multiplicatif : deux leviers de 10 % donnent 19 %, pas 20 %, car le
// second s'applique à ce qui reste après le premier.
export function facteurRestant(gainsPct: number[]): number {
  return gainsPct.reduce((f, g) => f * (1 - g / 100), 1);
}

// ---------- Simulation complète ----------

export interface PointGraphe {
  mois: number; // 1..12
  tm: number | null;
  chauffage: number;
  chauffageApres: [number, number]; // [gain max, gain min] -> zone grise
  climatisation: number;
  climatisationApres: [number, number];
}

export interface ResultatTrajectoire {
  annee: string;
  signatures: Signature[];
  points: PointGraphe[];
  reference: number; // kWh/an, toutes énergies
  simuleMin: number; // kWh/an avec gain_min (économie la plus faible)
  simuleMax: number; // kWh/an avec gain_max (économie la plus forte)
  reductionMin: number; // part de la référence économisée (0..1)
  reductionMax: number;
  moisPlafonnes: string[];
  climatisationModelisee: boolean;
  facturesExclues: number; // factures jugées non fiables, traitées comme manquantes
}

export type Echec = { erreur: string };

export function simulerTrajectoire(
  factures: Facture[],
  meteo: MoisMeteo[],
  leviersActifs: LevierSimulable[],
  avecClim: boolean,
  exclure: (f: Facture) => boolean = () => false
): ResultatTrajectoire | Echec {
  // Une facture jugée non fiable (ex. zéro en pleine saison de chauffe)
  // compte comme manquante partout, y compris dans la référence annuelle :
  // sinon la référence serait sous-estimée en silence.
  const toutes = factures;
  factures = toutes.filter((f) => !exclure(f));
  const nbExclues = toutes.length - factures.length;
  const annee = derniereAnneeCompleteToutesEnergies(factures);
  if (!annee) return { erreur: "Aucune année civile avec les 12 factures de chaque énergie : pas de référence annuelle fiable." };

  const energies = Array.from(new Set(factures.map((f) => f.energie))).sort();
  const meteoParMois = new Map(meteo.map((m) => [m.mois, m]));
  const moisAnnee = Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, "0")}`);

  const meteoManquante = moisAnnee.filter((m) => !meteoParMois.get(m) || meteoParMois.get(m)!.jours_manquants > 0);
  if (meteoManquante.length) return { erreur: `Météo incomplète en ${annee} : ${meteoManquante.join(", ")}.` };

  // La climatisation n'est modélisée que sur l'électricité.
  const signatures = energies.map((e) =>
    signatureEnergetique(e, factures, meteo, avecClim && e === "Électricité", undefined, ENERGIES_CHAUFFAGE_SEUL.includes(e))
  );

  const gains = (poste: Poste, cle: "gain_min_pct" | "gain_max_pct") =>
    leviersActifs
      .filter((l) => l.etat === "applicable" && posteDuLevier(l.levier.poste_concerne) === poste)
      .map((l) => l.levier[cle]);
  const fChMin = facteurRestant(gains("chauffage", "gain_min_pct"));
  const fChMax = facteurRestant(gains("chauffage", "gain_max_pct"));
  const fClMin = facteurRestant(gains("climatisation", "gain_min_pct"));
  const fClMax = facteurRestant(gains("climatisation", "gain_max_pct"));

  const moisPlafonnes: string[] = [];
  let reference = 0, simuleMin = 0, simuleMax = 0;
  const points: PointGraphe[] = moisAnnee.map((m, i) => {
    const mt = meteoParMois.get(m)!;
    let ch = 0, cl = 0, chMin = 0, chMax = 0, clMin = 0, clMax = 0;
    for (const s of signatures) {
      const f = factures.find((x) => x.energie === s.energie && x.mois === m)!;
      const p = decomposerMois(f, mt, s);
      if (p.plafonne) moisPlafonnes.push(`${s.energie} ${m}`);
      ch += p.chauffage;
      cl += p.climatisation;
      chMin += p.chauffage * fChMin;
      chMax += p.chauffage * fChMax;
      clMin += p.climatisation * fClMin;
      clMax += p.climatisation * fClMax;
      reference += p.facture;
      simuleMin += p.talon + p.chauffage * fChMin + p.climatisation * fClMin;
      simuleMax += p.talon + p.chauffage * fChMax + p.climatisation * fClMax;
    }
    return {
      mois: i + 1,
      tm: mt.tm,
      chauffage: ch,
      chauffageApres: [chMax, chMin],
      climatisation: cl,
      climatisationApres: [clMax, clMin],
    };
  });

  return {
    annee,
    signatures,
    points,
    reference,
    simuleMin,
    simuleMax,
    reductionMin: reference > 0 ? (reference - simuleMin) / reference : 0,
    reductionMax: reference > 0 ? (reference - simuleMax) / reference : 0,
    moisPlafonnes,
    climatisationModelisee: signatures.some((s) => s.climModelisee),
    facturesExclues: nbExclues,
  };
}
