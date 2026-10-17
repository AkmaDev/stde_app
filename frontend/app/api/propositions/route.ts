import { NextRequest, NextResponse } from "next/server";
import { lireToutesPropositions, ecrireToutesPropositions, Proposition } from "@/lib/propositions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/propositions?batimentId=11 -- liste des propositions d'un bâtiment
// (ou toutes si batimentId absent). Accessible à tous, lecture seule.
export async function GET(req: NextRequest) {
  const batimentId = req.nextUrl.searchParams.get("batimentId");
  const toutes = await lireToutesPropositions();
  const filtrees = batimentId ? toutes.filter((p) => p.batimentId === Number(batimentId)) : toutes;
  return NextResponse.json(filtrees);
}

// POST /api/propositions -- créer une proposition. Accessible à tous, sans
// authentification (décision actée : tout le monde peut proposer, seul un
// accès admin peut valider/rejeter -- voir [id]/route.ts).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { batimentId, champKey, champLabel, valeurActuelle, valeurProposee, commentaire, proposePar, avertissement } = body ?? {};

  if (!batimentId || !champKey || !valeurProposee || !commentaire) {
    return NextResponse.json({ erreur: "Champs requis manquants (batimentId, champKey, valeurProposee, commentaire)." }, { status: 400 });
  }

  const nouvelle: Proposition = {
    id: crypto.randomUUID(),
    batimentId: Number(batimentId),
    champKey: String(champKey),
    champLabel: String(champLabel ?? champKey),
    valeurActuelle: String(valeurActuelle ?? ""),
    valeurProposee: String(valeurProposee),
    commentaire: String(commentaire),
    avertissement: avertissement ? String(avertissement) : undefined,
    proposePar: String(proposePar ?? "Anonyme"),
    proposeLe: new Date().toISOString(),
    statut: "attente",
    decidePar: null,
    decideLe: null,
  };
  try {
    const toutes = await lireToutesPropositions();
    await ecrireToutesPropositions([...toutes, nouvelle]);
  } catch (e) {
    console.error("POST /api/propositions: échec écriture Blob", e);
    return NextResponse.json({ erreur: "Stockage indisponible (store Blob non relié) — réessayez plus tard." }, { status: 503 });
  }
  return NextResponse.json(nouvelle, { status: 201 });
}
