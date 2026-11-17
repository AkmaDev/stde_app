// Tests du calcul de l'onglet Trajectoire.
// Lancement : node --experimental-strip-types --test lib/trajectoire.test.ts
// Les oracles sont des valeurs choisies à la main pour fabriquer les données,
// jamais un appel au code testé.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decomposerMois,
  derniereAnneeComplete,
  facteurRestant,
  posteDuLevier,
  signatureEnergetique,
  simulerTrajectoire,
  type Facture,
  type LevierSimulable,
  type MoisMeteo,
} from "./trajectoire.ts";

// Météo synthétique sur 2024-2025 : DJU élevés en hiver, DJC en été.
const DJU = [380, 300, 240, 160, 70, 20, 5, 5, 50, 120, 260, 340];
const DJC = [0, 0, 0, 2, 10, 90, 120, 110, 25, 3, 0, 0];
function meteoSynthetique(): MoisMeteo[] {
  const out: MoisMeteo[] = [];
  for (const y of ["2024", "2025"]) {
    for (let m = 1; m <= 12; m++) {
      out.push({ mois: `${y}-${String(m).padStart(2, "0")}`, tm: 20 - DJU[m - 1] / 30, dju18: DJU[m - 1], djc18: DJC[m - 1], jours_mesures: 30, jours_manquants: 0 });
    }
  }
  return out;
}
const jours = (mois: string) => new Date(Number(mois.slice(0, 4)), Number(mois.slice(5)), 0).getDate();

// Factures exactes : talon 100 kWh/jour + 50 kWh par DJU (+ 30 par DJC si clim).
function factures(energie: string, talon: number, b: number, c = 0): Facture[] {
  return meteoSynthetique().map((mt, i) => ({ mois: mt.mois, energie, kwh: talon * jours(mt.mois) + b * DJU[i % 12] + c * DJC[i % 12] }));
}

const levier = (nom: string, poste: string, min: number, max: number, etat: LevierSimulable["etat"] = "applicable"): LevierSimulable => ({
  levier: { id: 0, nom, poste_concerne: poste, gain_min_pct: min, gain_max_pct: max, source: "test" },
  etat,
  commentaire: null,
});

test("la régression retrouve le talon et la pente de chauffage", () => {
  const s = signatureEnergetique("Vapeur", factures("Vapeur", 100, 50), meteoSynthetique(), false);
  assert.ok(s.chauffageDetecte, s.raison ?? "");
  assert.ok(Math.abs(s.talonParJour - 100) < 1e-6);
  assert.ok(Math.abs(s.b - 50) < 1e-6);
  assert.ok(s.r2 > 0.999);
});

test("la régression retrouve aussi la climatisation quand elle est modélisée", () => {
  const s = signatureEnergetique("Électricité", factures("Électricité", 100, 20, 30), meteoSynthetique(), true);
  assert.ok(s.climModelisee);
  assert.ok(Math.abs(s.c - 30) < 1e-6);
  assert.ok(Math.abs(s.b - 20) < 1e-6);
});

test("une énergie sans lien avec le froid n'est pas déclarée chauffage", () => {
  // Consommation qui baisse exactement quand il fait froid (b = −5, R² ≈ 1) :
  // seule la règle « b ≤ 0 » peut la rejeter, pas le seuil de R².
  const f = meteoSynthetique().map((mt, i) => ({ mois: mt.mois, energie: "Électricité", kwh: 200 * jours(mt.mois) - 5 * DJU[i % 12] }));
  const s = signatureEnergetique("Électricité", f, meteoSynthetique(), false);
  assert.ok(s.r2 > 0.99);
  assert.equal(s.chauffageDetecte, false);
  assert.match(s.raison ?? "", /froid/);
});

test("un lien trop faible avec la température est rejeté (seuil R²)", () => {
  // Pente positive minuscule noyée dans un bruit déterministe fort.
  const bruit = [900, -700, 800, -900, 600, -800, 700, -600, 900, -900, 800, -700];
  const f = meteoSynthetique().map((mt, i) => ({ mois: mt.mois, energie: "Gaz", kwh: 5000 + bruit[i % 12] + 0.5 * DJU[i % 12] }));
  const s = signatureEnergetique("Gaz", f, meteoSynthetique(), false);
  assert.equal(s.chauffageDetecte, false);
  assert.match(s.raison ?? "", /R²/);
});

test("un mois à météo incomplète est exclu de la régression", () => {
  const meteo = meteoSynthetique();
  meteo[0] = { ...meteo[0], jours_manquants: 5 };
  const s = signatureEnergetique("Vapeur", factures("Vapeur", 100, 50), meteo, false);
  assert.equal(s.nbMois, 23);
});

test("moins de 12 mois exploitables : pas de chauffage détecté", () => {
  const s = signatureEnergetique("Vapeur", factures("Vapeur", 100, 50).slice(0, 11), meteoSynthetique(), false);
  assert.equal(s.chauffageDetecte, false);
});

test("deux leviers de 10 % se cumulent en 19 %, pas 20 %", () => {
  assert.ok(Math.abs(facteurRestant([10, 10]) - 0.81) < 1e-12);
  assert.equal(facteurRestant([]), 1);
});

test("le poste est lu dans le libellé ADEME", () => {
  assert.equal(posteDuLevier("climatisation/confort été, chauffage"), "climatisation");
  assert.equal(posteDuLevier("chauffage, ventilation, auxiliaires"), "chauffage");
  assert.equal(posteDuLevier("éclairage"), "non_simule");
});

test("la décomposition conserve exactement la facture", () => {
  const meteo = meteoSynthetique();
  const f = factures("Électricité", 100, 20, 30);
  const s = signatureEnergetique("Électricité", f, meteo, true);
  for (let i = 0; i < f.length; i++) {
    const p = decomposerMois(f[i], meteo[i], s);
    assert.ok(Math.abs(p.talon + p.chauffage + p.climatisation - f[i].kwh) < 1e-6);
    assert.ok(p.talon >= 0 && p.chauffage >= 0 && p.climatisation >= 0);
  }
});

test("si le modèle dépasse la facture, les parts sont plafonnées et signalées", () => {
  const meteo = meteoSynthetique();
  const s = signatureEnergetique("Vapeur", factures("Vapeur", 100, 50), meteo, false);
  const p = decomposerMois({ mois: "2025-01", energie: "Vapeur", kwh: 1000 }, meteo[12], s);
  assert.ok(p.plafonne);
  assert.ok(Math.abs(p.chauffage - 1000) < 1e-6);
  assert.ok(p.talon >= -1e-9);
});

test("un levier chauffage de 20 % sur une énergie 100 % chauffage réduit la référence de 20 %", () => {
  const r = simulerTrajectoire(factures("Vapeur", 0, 50), meteoSynthetique(), [levier("Isolation", "chauffage", 20, 20)], false);
  assert.ok(!("erreur" in r));
  if ("erreur" in r) return;
  assert.equal(r.annee, "2025");
  assert.ok(Math.abs(r.reductionMin - 0.2) < 1e-6);
  assert.ok(Math.abs(r.reductionMax - 0.2) < 1e-6);
});

test("fourchette : gain min donne moins d'économie que gain max", () => {
  const r = simulerTrajectoire(factures("Vapeur", 100, 50), meteoSynthetique(), [levier("GTB", "chauffage", 5, 15)], false);
  if ("erreur" in r) assert.fail(r.erreur);
  assert.ok(r.reductionMin < r.reductionMax);
  assert.ok(r.points.every((p) => p.chauffageApres[0] <= p.chauffageApres[1]));
});

test("un levier déjà réalisé ou non applicable ne change rien", () => {
  const f = factures("Vapeur", 100, 50);
  const r = simulerTrajectoire(f, meteoSynthetique(), [levier("A", "chauffage", 20, 20, "deja_realise"), levier("B", "chauffage", 20, 20, "non_applicable")], false);
  if ("erreur" in r) assert.fail(r.erreur);
  assert.equal(r.reductionMax, 0);
});

test("la protection solaire n'agit pas sans climatisation modélisée", () => {
  const r = simulerTrajectoire(factures("Électricité", 100, 20), meteoSynthetique(), [levier("Protection solaire", "climatisation/confort été, chauffage", 5, 10)], false);
  if ("erreur" in r) assert.fail(r.erreur);
  assert.equal(r.reductionMax, 0);
});

test("la climatisation n'est modélisée que sur l'électricité", () => {
  const f = [...factures("Électricité", 100, 0, 30), ...factures("Gaz", 50, 40, 25)];
  const r = simulerTrajectoire(f, meteoSynthetique(), [], true);
  if ("erreur" in r) assert.fail(r.erreur);
  const gaz = r.signatures.find((s) => s.energie === "Gaz")!;
  assert.equal(gaz.climModelisee, false);
});

test("une énergie incomplète en 2025 fait reculer la référence à 2024", () => {
  const f = [...factures("Vapeur", 100, 50).filter((x) => x.mois !== "2025-03"), ...factures("Électricité", 100, 0)];
  const r = simulerTrajectoire(f, meteoSynthetique(), [], false);
  if ("erreur" in r) assert.fail(r.erreur);
  assert.equal(r.annee, "2024");
});

test("une facture exclue (zéro suspect) compte comme manquante dans la référence", () => {
  const f = factures("Vapeur", 100, 50).map((x) => (x.mois === "2025-11" ? { ...x, kwh: 0 } : x));
  const r = simulerTrajectoire(f, meteoSynthetique(), [], false, (x) => x.kwh === 0);
  if ("erreur" in r) assert.fail(r.erreur);
  assert.equal(r.annee, "2024");
  assert.equal(r.facturesExclues, 1);
});

test("aucune année complète pour toutes les énergies : calcul bloqué", () => {
  const f = [
    ...factures("Vapeur", 100, 50).filter((x) => x.mois !== "2025-03"),
    ...factures("Électricité", 100, 0).filter((x) => x.mois !== "2024-07"),
  ];
  const r = simulerTrajectoire(f, meteoSynthetique(), [], false);
  assert.ok("erreur" in r);
});

// Vapeur réaliste : chauffage coupé l'été et nul au-dessus de ~15 °C. La
// droite talon + DJU18 donne alors un talon négatif.
function vapeurCoupeeLEte(): Facture[] {
  const besoin = [300, 230, 170, 90, 0, 0, 0, 0, 0, 50, 190, 270];
  return meteoSynthetique().map((mt, i) => ({ mois: mt.mois, energie: "Vapeur", kwh: 60 * besoin[i % 12] }));
}

test("vapeur coupée l'été : talon négatif, mais comptée 100 % chauffage", () => {
  const meteo = meteoSynthetique();
  const brute = signatureEnergetique("Vapeur", vapeurCoupeeLEte(), meteo, false, undefined, false);
  assert.ok(brute.talonParJour < 0, "la donnée de test doit bien produire un talon négatif");
  assert.equal(brute.chauffageDetecte, false);
  const s = signatureEnergetique("Vapeur", vapeurCoupeeLEte(), meteo, false, undefined, true);
  assert.ok(s.chauffageDetecte, s.raison ?? "");
  const p = decomposerMois({ mois: "2025-01", energie: "Vapeur", kwh: 18000 }, meteo[12], s);
  assert.equal(p.chauffage, 18000);
  assert.equal(p.talon, 0);
});

test("vapeur sans lien avec le froid : pas comptée en chauffage", () => {
  const bruit = [900, -700, 800, -900, 600, -800, 700, -600, 900, -900, 800, -700];
  const f = meteoSynthetique().map((mt, i) => ({ mois: mt.mois, energie: "Vapeur", kwh: 5000 + bruit[i % 12] }));
  const s = signatureEnergetique("Vapeur", f, meteoSynthetique(), false, undefined, true);
  assert.equal(s.chauffageDetecte, false);
  const p = decomposerMois(f[12], meteoSynthetique()[12], s);
  assert.equal(p.chauffage, 0);
});

test("la simulation compte la vapeur en chauffage : levier de 20 % = −20 %", () => {
  const r = simulerTrajectoire(vapeurCoupeeLEte(), meteoSynthetique(), [levier("Isolation", "chauffage", 20, 20)], false);
  if ("erreur" in r) assert.fail(r.erreur);
  assert.ok(Math.abs(r.reductionMax - 0.2) < 1e-9);
});

test("année de référence = dernière année civile complète", () => {
  const f = factures("Vapeur", 100, 50);
  assert.equal(derniereAnneeComplete(f), "2025");
  assert.equal(derniereAnneeComplete(f.filter((x) => x.mois !== "2025-12")), "2024");
});
