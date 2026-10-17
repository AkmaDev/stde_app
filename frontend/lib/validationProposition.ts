// Contrôles légers sur le formulaire "Modifier" (Brique 1) -- pas un moteur
// de blocage de calcul (inutile ici, rien n'avance silencieusement dans une
// app statique), juste des garde-fous contre les erreurs de saisie sur un
// formulaire ouvert sans compte : type (un nombre reste un nombre) et plage
// physique plausible (avertissement, jamais bloquant -- une correction réelle
// mais inhabituelle doit pouvoir passer).

export function extraitNombre(s: string): number | null {
  const m = s.trim().replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isNaN(n) ? null : n;
}

export const PLAGES_PHYSIQUES: Record<string, { min: number; max: number; unite: string }> = {
  annee_de_construction: { min: 1800, max: 2026, unite: "" },
  nombre_d_etages: { min: 1, max: 40, unite: "étages" },
  surface_de_reference: { min: 10, max: 50000, unite: "m²" },
  hauteur_du_batiment_apur: { min: 2, max: 250, unite: "m" },
  hauteur_d_etage_reelle: { min: 1.5, max: 10, unite: "m" },
  r_estime_d_isolation: { min: 0.2, max: 15, unite: "m².K/W" },
  consommation_mesuree: { min: 5, max: 3000, unite: "kWh/m²·an" },
};

export function valideProposition(
  champKey: string,
  valeurActuelle: string,
  valeurProposee: string
): { erreur?: string; avertissement?: string } {
  const nombreActuel = extraitNombre(valeurActuelle);
  const nombreValeurActuelleAttendu = nombreActuel != null; // la donnée d'origine est numérique

  if (nombreValeurActuelleAttendu) {
    const nombreProposee = extraitNombre(valeurProposee);
    if (nombreProposee == null) {
      return { erreur: `La valeur d'origine est numérique (${valeurActuelle}) — la nouvelle valeur doit l'être aussi.` };
    }
    const plage = PLAGES_PHYSIQUES[champKey];
    if (plage && (nombreProposee < plage.min || nombreProposee > plage.max)) {
      return {
        avertissement: `Valeur hors plage physique habituelle pour ce champ (${plage.min} – ${plage.max} ${plage.unite}).`,
      };
    }
  }
  return {};
}
