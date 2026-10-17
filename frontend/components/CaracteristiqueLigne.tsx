"use client";

import { useState } from "react";
import { ORIGINE_CLASS, ORIGINE_LABEL } from "@/lib/ui";
import { DocumentBatiment } from "@/lib/api";
import { Proposition } from "@/lib/propositions";
import { valideProposition } from "@/lib/validationProposition";

export type Caracteristique = {
  label: string;
  valeur: string | number | null;
  origine: keyof typeof ORIGINE_LABEL;
  secondaire?: boolean;
  note?: string;
};

export function slugChamp(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Lien "Vérifier" uniquement quand un document réel correspondant existe --
// jamais un lien vers rien. Heuristique simple : la note cite "DPE" et un
// document du bâtiment a "DPE" dans son libellé.
function trouveDocumentSource(note: string | undefined, documents: DocumentBatiment[]): DocumentBatiment | null {
  if (!note) return null;
  if (note.includes("DPE")) {
    return documents.find((d) => d.label.includes("DPE")) ?? null;
  }
  return null;
}

export default function CaracteristiqueLigne({
  c,
  batimentId,
  documents,
  propositions,
  admin,
  demanderMotDePasse,
  onChange,
}: {
  c: Caracteristique;
  batimentId: number;
  documents: DocumentBatiment[];
  propositions: Proposition[];
  admin: boolean;
  demanderMotDePasse: () => string | null;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [valeur, setValeur] = useState("");
  const [proposePar, setProposePar] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  const champKey = slugChamp(c.label);
  const docSource = trouveDocumentSource(c.note, documents);
  const enAttente = propositions.find((p) => p.champKey === champKey && p.statut === "attente");
  const validee = [...propositions].reverse().find((p) => p.champKey === champKey && p.statut === "validee");

  async function soumettre() {
    if (!valeur.trim() || !commentaire.trim()) {
      setErreur("Valeur et justification sont obligatoires.");
      return;
    }
    // Contrôles légers (type + plage physique plausible) -- voir
    // lib/validationProposition.ts. Le type est bloquant, la plage n'est
    // qu'un avertissement transmis à l'admin, jamais un blocage.
    const controle = valideProposition(champKey, String(c.valeur ?? ""), valeur);
    if (controle.erreur) {
      setErreur(controle.erreur);
      return;
    }
    setAvertissement(controle.avertissement ?? null);
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/propositions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batimentId,
          champKey,
          champLabel: c.label,
          valeurActuelle: c.valeur ?? "—",
          valeurProposee: valeur,
          commentaire,
          avertissement: controle.avertissement,
          proposePar: proposePar || "Anonyme",
        }),
      });
      if (!res.ok) throw new Error();
      setEditing(false);
      setValeur("");
      setProposePar("");
      setCommentaire("");
      setAvertissement(null);
      onChange();
    } catch {
      setErreur("Échec de l'envoi — réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  async function decider(action: "valider" | "rejeter") {
    if (!enAttente) return;
    const password = demanderMotDePasse();
    if (password == null) return;
    const res = await fetch(`/api/propositions/${enAttente.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, password }),
    });
    if (res.status === 401) {
      alert("Mot de passe administrateur incorrect.");
      return;
    }
    if (!res.ok) {
      alert("Échec de la décision — réessayez.");
      return;
    }
    onChange();
  }

  return (
    <>
      <tr>
        <td className="mut" style={{ width: 230 }}>{c.label}</td>
        <td>
          <b>{c.valeur ?? "—"}</b>
        </td>
        <td style={{ width: 140 }}>
          <span className={`tag ${ORIGINE_CLASS[c.origine]}`}>
            <span className="dot" />{ORIGINE_LABEL[c.origine]}
          </span>
        </td>
        <td style={{ fontSize: 11.5, color: "#5B6472" }}>
          {c.valeur == null ? (
            // Jamais de source affichée à côté d'une valeur absente -- ce
            // serait laisser croire qu'on a vérifié ce document et qu'il est
            // vide, alors qu'on n'a simplement rien trouvé (bug repéré le 08/10).
            "—"
          ) : (
            <>
              {c.note ?? "—"}
              {docSource && (
                <>
                  {" "}
                  <a href={docSource.url} target="_blank" rel="noreferrer" style={{ color: "#000091" }}>
                    Vérifier ↗
                  </a>
                </>
              )}
            </>
          )}
        </td>
        <td style={{ width: 90 }}>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            style={{ fontSize: 11.5, padding: "4px 10px", border: "1px solid #D5DEE1", borderRadius: 5, background: "white", cursor: "pointer" }}
          >
            {editing ? "Annuler" : "Modifier"}
          </button>
        </td>
      </tr>

      {validee && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <div style={{ background: "#EEF8F0", border: "1px solid #BFE3C6", borderRadius: 6, padding: "10px 14px", margin: "4px 0 10px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#2C7A56", textTransform: "uppercase", marginBottom: 6 }}>
                ● Correction validée
              </div>
              <div style={{ display: "flex", gap: 30, fontSize: 12.5 }}>
                <div>
                  <div className="mut" style={{ fontSize: 10.5 }}>Valeur du document source</div>
                  <b>{validee.valeurActuelle}</b>
                </div>
                <div>
                  <div className="mut" style={{ fontSize: 10.5 }}>Valeur corrigée (officielle)</div>
                  <b>{validee.valeurProposee}</b>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: "#33474F", marginTop: 6 }}>« {validee.commentaire} »</div>
              <div style={{ fontSize: 10.5, color: "#5B6472", marginTop: 4 }}>
                Proposée par {validee.proposePar} le {new Date(validee.proposeLe).toLocaleString("fr-FR")} — validée par {validee.decidePar} le{" "}
                {validee.decideLe && new Date(validee.decideLe).toLocaleString("fr-FR")}
              </div>
            </div>
          </td>
        </tr>
      )}

      {enAttente && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <div style={{ background: "#FBF0E0", border: "1px dashed #E8CA8F", borderRadius: 6, padding: "10px 14px", margin: "4px 0 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#9A6417", textTransform: "uppercase", marginBottom: 6 }}>
                  ○ Proposition en attente de validation
                </div>
                <div style={{ fontSize: 12.5 }}>
                  Valeur proposée : <b>{enAttente.valeurProposee}</b> (au lieu de {enAttente.valeurActuelle})
                </div>
                {enAttente.avertissement && (
                  <div style={{ fontSize: 11, color: "#C0503F", marginTop: 4, fontWeight: 600 }}>⚠ {enAttente.avertissement}</div>
                )}
                <div style={{ fontSize: 11.5, color: "#33474F", marginTop: 4 }}>« {enAttente.commentaire} »</div>
                <div style={{ fontSize: 10.5, color: "#5B6472", marginTop: 4 }}>
                  Proposé par {enAttente.proposePar} — {new Date(enAttente.proposeLe).toLocaleString("fr-FR")}
                </div>
              </div>
              {admin && (
                <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                  <button
                    type="button"
                    onClick={() => decider("valider")}
                    style={{ background: "#000091", color: "white", border: "none", borderRadius: 5, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                  >
                    Valider
                  </button>
                  <button
                    type="button"
                    onClick={() => decider("rejeter")}
                    style={{ background: "white", color: "#C0503F", border: "1px solid #E7C3BC", borderRadius: 5, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                  >
                    Rejeter
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {editing && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <div style={{ border: "1px solid #E1E9EC", borderRadius: 6, padding: "12px 14px", margin: "4px 0 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                Proposer une correction pour <b>{c.label}</b> — valeur actuelle {c.valeur ?? "—"}
              </div>
              <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#5B6472", marginBottom: 3 }}>Nouvelle valeur</div>
                  <input
                    value={valeur}
                    onChange={(e) => {
                      setValeur(e.target.value);
                      const c2 = valideProposition(champKey, String(c.valeur ?? ""), e.target.value);
                      setErreur(null);
                      setAvertissement(c2.avertissement ?? null);
                    }}
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #D5DEE1", borderRadius: 5, fontSize: 12.5 }}
                  />
                  {avertissement && (
                    <div style={{ fontSize: 10.5, color: "#C0503F", marginTop: 3 }}>⚠ {avertissement}</div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#5B6472", marginBottom: 3 }}>Votre nom / service</div>
                  <input
                    value={proposePar}
                    onChange={(e) => setProposePar(e.target.value)}
                    placeholder="ex. M. Durand — SBC"
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #D5DEE1", borderRadius: 5, fontSize: 12.5 }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#5B6472", marginBottom: 3 }}>Justification du changement (obligatoire)</div>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Document ou constat qui justifie la correction (ex. PV de réception de travaux, relevé sur site...)"
                rows={2}
                style={{ width: "100%", padding: "6px 8px", border: "1px solid #D5DEE1", borderRadius: 5, fontSize: 12.5, marginBottom: 8 }}
              />
              {erreur && <div style={{ color: "#C0503F", fontSize: 11.5, marginBottom: 8 }}>{erreur}</div>}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  disabled={envoi}
                  onClick={soumettre}
                  style={{ background: "#000091", color: "white", border: "none", borderRadius: 5, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }}
                >
                  {envoi ? "Envoi…" : "Soumettre la proposition"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  style={{ background: "white", border: "1px solid #D5DEE1", borderRadius: 5, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
