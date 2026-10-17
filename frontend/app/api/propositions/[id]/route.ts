import { NextRequest, NextResponse } from "next/server";
import { lireToutesPropositions, ecrireToutesPropositions } from "@/lib/propositions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/propositions/[id] -- { action: "valider" | "rejeter", password }
// Le mot de passe est vérifié ici, côté serveur, contre process.env.ADMIN_PASSWORD
// -- jamais exposé au bundle client (décision actée : pas de vrais comptes,
// un seul accès admin par mot de passe partagé).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { action, password } = body ?? {};

  if (action !== "valider" && action !== "rejeter") {
    return NextResponse.json({ erreur: "action doit être 'valider' ou 'rejeter'." }, { status: 400 });
  }

  const motDePasseAttendu = process.env.ADMIN_PASSWORD;
  if (!motDePasseAttendu) {
    return NextResponse.json({ erreur: "ADMIN_PASSWORD non configuré côté serveur." }, { status: 500 });
  }
  if (password !== motDePasseAttendu) {
    return NextResponse.json({ erreur: "Mot de passe incorrect." }, { status: 401 });
  }

  try {
    const toutes = await lireToutesPropositions();
    const idx = toutes.findIndex((p) => p.id === params.id);
    if (idx === -1) {
      return NextResponse.json({ erreur: "Proposition introuvable." }, { status: 404 });
    }
    toutes[idx] = {
      ...toutes[idx],
      statut: action === "valider" ? "validee" : "rejetee",
      decidePar: "Administrateur",
      decideLe: new Date().toISOString(),
    };
    await ecrireToutesPropositions(toutes);
    return NextResponse.json(toutes[idx]);
  } catch (e) {
    console.error("POST /api/propositions/[id]: échec écriture Blob", e);
    return NextResponse.json({ erreur: "Stockage indisponible (store Blob non relié) — réessayez plus tard." }, { status: 503 });
  }
}
