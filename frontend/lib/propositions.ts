// Stockage partagé des propositions de correction (Brique 1 : "Modifier" sur
// une donnée). Un seul fichier JSON dans Vercel Blob -- pas de base SQL,
// disproportionnée à l'échelle actuelle (11 bâtiments, petite équipe). Lire-
// modifier-écrire sur un seul fichier : risque réel de collision si deux
// écritures strictement simultanées -- acceptable à ce stade, à surveiller
// si l'usage grandit (voir 21_CHANTIERS_OUVERTS_ET_BLOCAGES.md).
import { list, put } from "@vercel/blob";

export type StatutProposition = "attente" | "validee" | "rejetee";

export interface Proposition {
  id: string;
  batimentId: number;
  champKey: string;
  champLabel: string;
  valeurActuelle: string;
  valeurProposee: string;
  commentaire: string;
  // Avertissement calculé côté client au moment de la soumission (ex. valeur
  // hors plage physique plausible) -- jamais bloquant, juste affiché à
  // l'admin pour l'aider à décider. Voir lib/validationProposition.ts.
  avertissement?: string;
  proposePar: string;
  proposeLe: string; // ISO-8601
  statut: StatutProposition;
  decidePar: string | null;
  decideLe: string | null; // ISO-8601
}

const BLOB_PATHNAME = "propositions.json";

export async function lireToutesPropositions(): Promise<Proposition[]> {
  // Tolérant plutôt que bloquant : si le store Blob n'est pas encore relié
  // (BLOB_READ_WRITE_TOKEN absent) ou en cas d'erreur réseau, on retourne une
  // liste vide plutôt que de faire planter la fiche bâtiment -- la fonctionnalité
  // de correction est alors simplement indisponible, pas une page cassée.
  try {
    const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
    const existant = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (!existant) return [];
    const res = await fetch(existant.url, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as Proposition[];
  } catch (e) {
    console.error("lireToutesPropositions: échec lecture Blob", e);
    return [];
  }
}

export async function ecrireToutesPropositions(propositions: Proposition[]): Promise<void> {
  await put(BLOB_PATHNAME, JSON.stringify(propositions, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });
}
