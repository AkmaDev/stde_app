"use client";

// Port du composant de référence (design_handoff_sdte/src/CaracteristiquesTab.tsx) --
// structure et CSS conservés. Ajouts : le bouton "Proposer"/"Valider" (sans
// onClick dans la référence) est branché sur la vraie logique de proposition,
// portée depuis components/CaracteristiqueLigne.tsx (même backend, même clé
// de champ `slugChamp(label)` pour rester compatible avec les propositions
// déjà stockées).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DocumentBatiment } from "@/lib/api";
import { Row, FacadeRow, ScoreRow } from "@/lib/caracAdapter";
import { Proposition } from "@/lib/propositions";
import { slugChamp } from "./CaracteristiqueLigne";
import { valideProposition } from "@/lib/validationProposition";

const TAG: Record<Row["st"], [string, string, string]> = {
  doc: ["Documentée", "#0063cb", "#e8edff"],
  hyp: ["Hypothèse", "#716043", "#feecc2"],
  obs: ["Constatée", "#18753c", "#b8fec9"],
  none: ["Manquante", "#666", "#eee"],
};

const H2: React.CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" };
const P: React.CSSProperties = { margin: 0, fontSize: 16 };

function Q({ size = 16 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, flex: "none", borderRadius: "50%", border: "1px solid currentColor", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size === 16 ? 10 : 9, fontWeight: 700, lineHeight: 1 }}>
      ?
    </span>
  );
}

export default function CaracteristiquesTab({
  batimentId,
  rows,
  facHeads,
  facades,
  scores,
  footnote,
  documents,
  propositions,
  admin,
  setAdmin,
  demanderMotDePasse,
  onChange,
}: {
  batimentId: number;
  rows: Row[];
  facHeads: { h: string; anchor: string }[];
  facades: FacadeRow[];
  scores: ScoreRow[];
  footnote: { status: string; dpeDate?: string; suivi?: string };
  documents: DocumentBatiment[];
  propositions: Proposition[];
  admin: boolean;
  setAdmin: (v: boolean) => void;
  demanderMotDePasse: () => string | null;
  onChange: () => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | Row["st"]>("all");
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const goMethod = (anchor: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    router.push(`/documentation/${batimentId}#${anchor}`);
  };
  const count = (k: "all" | Row["st"]) => (k === "all" ? rows.length : rows.filter((r) => r.st === k).length);
  const shown = rows.filter((r) => filter === "all" || r.st === filter);
  const grid6 = "minmax(0,1.1fr) repeat(5,minmax(0,1fr))";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 80 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 560 }}>
            <h2 style={H2}>Caractéristiques du bâtiment</h2>
            <p style={P}>Chaque valeur est rattachée à son document source. Toute modification est proposée puis validée par l&apos;administrateur.</p>
          </div>
          <button onClick={() => setAdmin(!admin)} style={{ display: "flex", gap: 10, alignItems: "center", background: "none", border: 0, fontSize: 14, color: "#3a3a3a", cursor: "pointer", padding: "4px 0" }}>
            <span style={{ width: 36, height: 20, border: "1px solid #000091", background: admin ? "#000091" : "#fff", position: "relative", borderRadius: 10, boxSizing: "border-box" }}>
              <span style={{ position: "absolute", top: 2, left: admin ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: admin ? "#fff" : "#000091" }} />
            </span>
            Mode administrateur
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([["all", "Toutes"], ["doc", "Documentées"], ["hyp", "Hypothèses"], ["obs", "Constatées"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ border: "1px solid #000091", borderRadius: 16, background: filter === k ? "#000091" : "#fff", color: filter === k ? "#fff" : "#000091", padding: "4px 14px", fontSize: 14, cursor: "pointer" }}>
              {l} · {count(k)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #ddd" }}>
          {shown.map((r) => {
            const t = TAG[r.st];
            const champKey = slugChamp(r.label);
            const enAttente = propositions.find((p) => p.champKey === champKey && p.statut === "attente");
            const validee = [...propositions].reverse().find((p) => p.champKey === champKey && p.statut === "validee");
            return (
              <div key={r.code} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.7fr) auto", gap: 24, alignItems: "start", padding: "22px 0", borderBottom: "1px solid #eee" }}>
                  <span style={{ fontSize: 15, paddingTop: 2, color: "#3a3a3a" }}>{r.label}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 500, color: "#161616", fontVariantNumeric: "tabular-nums" }}>{r.value || "—"}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: t[1], background: t[2], padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{t[0]}</span>
                    </div>
                    <a href={`#${r.anchor}`} onClick={goMethod(r.anchor)} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#000091", textDecoration: "none", alignSelf: "flex-start" }}>
                      <Q />
                      <span style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{r.st === "none" ? "Pourquoi cette donnée est-elle manquante ?" : "Comment cette donnée a-t-elle été collectée ?"}</span>
                      <span className="code-mono" style={{ color: "#888", fontSize: 12 }}>{r.code}</span>
                    </a>
                  </div>
                  <button
                    onClick={() => setEditingCode(editingCode === r.code ? null : r.code)}
                    style={{ background: "none", border: 0, color: "#000091", fontSize: 14, cursor: "pointer", padding: "2px 0" }}
                  >
                    {admin ? "Valider" : "Proposer"}
                  </button>
                </div>

                {validee && (
                  <div style={{ background: "#EEF8F0", border: "1px solid #BFE3C6", borderRadius: 6, padding: "10px 14px", margin: "4px 0 10px", fontSize: 12.5 }}>
                    <div style={{ fontWeight: 700, color: "#2C7A56", marginBottom: 4 }}>Correction validée</div>
                    <div>
                      <b>{validee.valeurProposee}</b> — « {validee.commentaire} »
                    </div>
                  </div>
                )}
                {enAttente && (
                  <div style={{ background: "#FBF0E0", border: "1px dashed #E8CA8F", borderRadius: 6, padding: "10px 14px", margin: "4px 0 10px", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#9A6417", marginBottom: 4 }}>Proposition en attente</div>
                      <div>
                        <b>{enAttente.valeurProposee}</b> (au lieu de {enAttente.valeurActuelle}) — « {enAttente.commentaire} »
                      </div>
                    </div>
                    {admin && (
                      <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                        <button onClick={() => decider(enAttente.id, "valider")} style={{ background: "#000091", color: "white", border: "none", borderRadius: 5, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                          Valider
                        </button>
                        <button onClick={() => decider(enAttente.id, "rejeter")} style={{ background: "white", color: "#C0503F", border: "1px solid #E7C3BC", borderRadius: 5, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                          Rejeter
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {editingCode === r.code && (
                  <ProposerForm
                    batimentId={batimentId}
                    champKey={champKey}
                    champLabel={r.label}
                    valeurActuelle={r.value}
                    onDone={() => {
                      setEditingCode(null);
                      onChange();
                    }}
                    onCancel={() => setEditingCode(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
          <h2 style={H2}>Façades et apports solaires</h2>
          <p style={P}>Chaque valeur renvoie à sa méthode de collecte dans la documentation. Le point orange signale une hypothèse.</p>
        </div>
        {facades.length ? (
          <div style={{ display: "flex", flexDirection: "column", overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: grid6, gap: 16, paddingBottom: 12, borderBottom: "1px solid #ddd", fontSize: 14, color: "#666", minWidth: 620 }}>
              <span>Façade</span>
              {facHeads.map((h) => (
                <a key={h.anchor} href={`#${h.anchor}`} onClick={goMethod(h.anchor)} style={{ display: "flex", alignItems: "center", gap: 6, color: "#666", textDecoration: "none" }}>
                  <span>{h.h}</span>
                  <Q size={14} />
                </a>
              ))}
            </div>
            {facades.map((f) => (
              <div key={f.n} style={{ display: "grid", gridTemplateColumns: grid6, gap: 16, alignItems: "center", padding: "16px 0", borderBottom: "1px solid #eee", fontSize: 15, minWidth: 620, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "#161616", fontWeight: 500 }}>{f.n}</span>
                {f.cells.map((c, i) => (
                  <a key={i} href={`#${c.anchor}`} onClick={goMethod(c.anchor)} style={{ display: "flex", alignItems: "center", gap: 6, color: "#3a3a3a", textDecoration: "underline dotted #aaa", textUnderlineOffset: 4 }}>
                    <span>{c.txt}</span>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.hyp ? "#c8a03a" : "transparent", flex: "none" }} />
                  </a>
                ))}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "20px 0", fontSize: 15, minWidth: 620 }}>
              <span style={{ color: "#161616", fontWeight: 500 }}>Total des {facades.length} façades</span>
              <span style={{ color: "#161616", fontWeight: 700 }}>{facades.reduce((a, f) => a + f.ap, 0).toLocaleString("fr-FR")} kWh/an</span>
            </div>
          </div>
        ) : (
          <div style={{ background: "#f6f6f6", padding: 24, fontSize: 15, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ color: "#161616", fontWeight: 500 }}>Aucune façade relevée pour ce bâtiment.</span>
          </div>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <h2 style={H2}>Score SCT</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 32 }}>
          {scores.map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 15 }}>{s.label}</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#161616", fontVariantNumeric: "tabular-nums" }}>{s.val == null ? "—" : s.val}</span>
              </div>
              <div style={{ height: 4, background: "#eee", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: (s.val ?? 0) + "%", background: "#000091" }} />
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "#666", maxWidth: 640 }}>
          {footnote.status}
          {footnote.dpeDate && <> Dernière mise à jour du DPE : {footnote.dpeDate}.</>}
          {footnote.suivi && <> Suivi depuis le DPE : {footnote.suivi}.</>}{" "}
          <a href="/etat-du-projet" style={{ color: "#000091" }}>État du système</a>
        </p>
      </section>
    </div>
  );

  async function decider(id: string, action: "valider" | "rejeter") {
    const password = demanderMotDePasse();
    if (password == null) return;
    const res = await fetch(`/api/propositions/${id}`, {
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
}

function ProposerForm({
  batimentId,
  champKey,
  champLabel,
  valeurActuelle,
  onDone,
  onCancel,
}: {
  batimentId: number;
  champKey: string;
  champLabel: string;
  valeurActuelle: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [valeur, setValeur] = useState("");
  const [proposePar, setProposePar] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avertissement, setAvertissement] = useState<string | null>(null);

  async function soumettre() {
    if (!valeur.trim() || !commentaire.trim()) {
      setErreur("Valeur et justification sont obligatoires.");
      return;
    }
    const controle = valideProposition(champKey, valeurActuelle, valeur);
    if (controle.erreur) {
      setErreur(controle.erreur);
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/propositions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batimentId,
          champKey,
          champLabel,
          valeurActuelle,
          valeurProposee: valeur,
          commentaire,
          avertissement: controle.avertissement,
          proposePar: proposePar || "Anonyme",
        }),
      });
      if (!res.ok) throw new Error();
      onDone();
    } catch {
      setErreur("Échec de l'envoi — réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 6, padding: "16px 20px", margin: "4px 0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>
        Proposer une correction pour <b>{champLabel}</b> — valeur actuelle {valeurActuelle}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 3 }}>Nouvelle valeur</div>
          <input value={valeur} onChange={(e) => { setValeur(e.target.value); setErreur(null); }} style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e5e5", borderRadius: 4, fontSize: 13 }} />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 3 }}>Votre nom / service</div>
          <input value={proposePar} onChange={(e) => setProposePar(e.target.value)} placeholder="ex. M. Durand — SBC" style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e5e5", borderRadius: 4, fontSize: 13 }} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 3 }}>Justification (obligatoire)</div>
        <textarea value={commentaire} onChange={(e) => setCommentaire(e.target.value)} rows={2} style={{ width: "100%", padding: "7px 10px", border: "1px solid #e5e5e5", borderRadius: 4, fontSize: 13 }} />
      </div>
      {avertissement && <div style={{ color: "#C0503F", fontSize: 12 }}>⚠ {avertissement}</div>}
      {erreur && <div style={{ color: "#C0503F", fontSize: 12 }}>{erreur}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={soumettre} disabled={envoi} style={{ background: "#000091", color: "white", border: "none", borderRadius: 5, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
          {envoi ? "Envoi…" : "Soumettre"}
        </button>
        <button onClick={onCancel} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 5, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>
          Annuler
        </button>
      </div>
    </div>
  );
}
