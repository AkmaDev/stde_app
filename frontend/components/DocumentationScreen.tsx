"use client";

// Port adapté de design_handoff_sdte/src/DocumentationScreen.tsx -- routing
// Next.js réel (pas de state interne screen/navigate), contenu réel via
// lib/caracAdapter.ts + lib/caracFields.ts (pas sdte-data.js).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Batiment } from "@/lib/api";
import { adaptCarac, slug } from "@/lib/caracAdapter";
import { getFieldDoc, getFacadeFieldDoc } from "@/lib/caracFields";

const RUBS: [string, string][] = [
  ["A", "Identification"],
  ["B", "Structure"],
  ["C", "Géométrie"],
  ["D", "Enveloppe"],
  ["E", "Façades et vitrage"],
  ["F", "Énergie"],
];

const TAG: Record<string, [string, string, string]> = {
  doc: ["Documentée", "#0063cb", "#e8edff"],
  hyp: ["Hypothèse", "#716043", "#feecc2"],
  obs: ["Constatée", "#18753c", "#b8fec9"],
  none: ["Manquante", "#666", "#eee"],
};
const STATUS_TXT: Record<string, string> = {
  doc: "Valeur lue dans un document ou une base de référence, avec sa page ou son champ source.",
  hyp: "Valeur déduite d'indices indirects. À confirmer par une mesure ou un document.",
  obs: "Valeur issue de relevés réels (factures, compteurs) sur une période donnée.",
  none: "Aucun document disponible ne permet de renseigner la valeur à ce jour.",
};

const Tag = ({ st }: { st: string }) => {
  const t = TAG[st];
  return <span style={{ fontSize: 12, fontWeight: 500, color: t[1], background: t[2], padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{t[0]}</span>;
};
const Meta = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <span style={{ fontSize: 13, color: "#666" }}>{k}</span>
    <span style={{ fontSize: 15, color: "#161616" }}>{children}</span>
  </div>
);
const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: "#f6f6f6", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, fontSize: 14, lineHeight: 1.55 }}>
    <span style={{ fontWeight: 700, color: "#161616" }}>{title}</span>
    <span>{children}</span>
  </div>
);
const H2: React.CSSProperties = { margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" };
const FIELD_INPUT: React.CSSProperties = { border: 0, borderBottom: "2px solid #3a3a3a", borderRadius: "4px 4px 0 0", background: "#eee", color: "#161616", fontFamily: "inherit", outline: "none" };

type Item = { code: string; k: string; label: string; value: string; st: string; anchor: string; fieldDoc: ReturnType<typeof getFieldDoc> };

export default function DocumentationScreen({
  batiments,
  batimentId,
}: {
  batiments: { batiment: Batiment }[];
  batimentId: number;
}) {
  const router = useRouter();
  const db = batiments.find((x) => x.batiment.id === batimentId) ?? batiments[0];
  const batiment = db.batiment;
  const bs = slug(batiment.nom);
  const data = useMemo(() => adaptCarac(batiment), [batiment]);

  const [q, setQ] = useState("");
  const [hl, setHl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const hlT = useRef<any>();
  const cpT = useRef<any>();
  const srcA = (c: string) => `${bs}--src-${c.toLowerCase()}`;

  function jumpTo(anchor: string) {
    setQ("");
    setHl(anchor);
    let tries = 0;
    const jump = () => {
      const el = document.getElementById(anchor);
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24);
      if (++tries < 4) setTimeout(jump, 120);
    };
    setTimeout(jump, 50);
    clearTimeout(hlT.current);
    hlT.current = setTimeout(() => setHl(null), 2800);
  }
  useEffect(() => {
    const anchor = decodeURIComponent(location.hash.slice(1));
    if (anchor) jumpTo(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batimentId]);

  const go = (a: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    jumpTo(a);
  };
  const copy = (a: string) => {
    navigator.clipboard?.writeText(location.href.split("#")[0] + "#" + a).catch(() => {});
    setCopied(a);
    clearTimeout(cpT.current);
    cpT.current = setTimeout(() => setCopied(null), 1600);
  };

  const items: Item[] = data.rows.map((r) => ({
    code: r.code,
    k: r.code[0],
    label: r.label,
    value: r.value,
    st: r.st,
    anchor: r.anchor,
    fieldDoc: getFieldDoc(r.code, batiment),
  }));
  // Rubrique E : un article par champ (E.1..E.5), pas par façade.
  const eFields: { code: "E.1" | "E.2" | "E.3" | "E.4" | "E.5"; label: string }[] = [
    { code: "E.1", label: "Longueur des façades" },
    { code: "E.2", label: "Orientation des façades" },
    { code: "E.3", label: "Taux de vitrage" },
    { code: "E.4", label: "Irradiation solaire" },
    { code: "E.5", label: "Apport solaire" },
  ];
  // Index de cellule par code (fixé par caracAdapter.ts : E.1..E.5 -> 0..4).
  // "doc" seulement si une valeur existe reellement pour au moins une
  // facade ET qu'aucune n'est marquee hypothese ; "none" si aucune facade
  // n'a de valeur pour ce champ -- jamais "doc" par defaut comme avant.
  const cellIndex: Record<string, number> = { "E.1": 0, "E.2": 1, "E.3": 2, "E.4": 3, "E.5": 4 };
  function stForFacadeCode(code: string): "doc" | "hyp" | "none" {
    const idx = cellIndex[code];
    const cells = data.facades.map((fa) => fa.cells[idx]).filter((c): c is NonNullable<typeof c> => c != null);
    const avecValeur = cells.filter((c) => c.txt !== "—");
    if (avecValeur.length === 0) return "none";
    return avecValeur.some((c) => c.hyp) ? "hyp" : "doc";
  }
  if (data.facades.length > 0) {
    eFields.forEach((f) => {
      items.push({
        code: f.code,
        k: "E",
        label: f.label,
        value: "",
        st: stForFacadeCode(f.code),
        anchor: `${bs}--${f.code.toLowerCase().replace(".", "")}`,
        fieldDoc: getFacadeFieldDoc(f.code, batiment),
      });
    });
  }

  const dq = q.trim().toLowerCase();
  const filtered = items.filter((x) => !dq || x.label.toLowerCase().includes(dq) || x.code.toLowerCase().includes(dq));
  const rubs = RUBS.map(([k, t]) => ({ k, t, anchor: `${bs}--rub-${k.toLowerCase()}`, items: filtered.filter((x) => x.k === k) })).filter((g) => g.items.length);
  const isOn = (a: string) => !!hl && (hl === a || hl.startsWith(a + "-f"));
  const counts = { doc: 0, hyp: 0, obs: 0, none: 0 } as Record<string, number>;
  items.forEach((x) => counts[x.st]++);
  const docs = batiment.documents.map((d, i) => ({ c: `DOC${i + 1}`, t: d.label, url: d.url }));

  return (
    <div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 32px 0", fontSize: 13, display: "flex", gap: 8, color: "#666", flexWrap: "wrap" }}>
        <a href="/" onClick={(e) => { e.preventDefault(); router.push("/"); }} style={{ color: "#666" }}>Accueil</a>
        <span>›</span>
        <span>Documentation des données</span>
        <span>›</span>
        <span>{batiment.nom}</span>
      </div>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 48px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 32, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#666" }}>Documentation des données</span>
          <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, lineHeight: 1.15, color: "#000091" }}>{batiment.nom}</h1>
          <p style={{ margin: 0, fontFamily: "var(--font-serif),Spectral,Georgia,serif", fontStyle: "italic", fontSize: 20, color: "#000091" }}>
            Dossier documentaire — réf. B{batiment.id}
          </p>
          <span style={{ fontSize: 15 }}>{batiment.adresse ?? `Paris ${batiment.arrondissement} — adresse à vérifier`}</span>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: "#161616", minWidth: 280 }}>
          Changer de bâtiment
          <select
            value={batiment.id}
            onChange={(e) => {
              setHl(null);
              router.push(`/documentation/${e.target.value}`);
              window.scrollTo(0, 0);
            }}
            style={{ ...FIELD_INPUT, padding: "10px 14px", fontSize: 16, cursor: "pointer" }}
          >
            {batiments.map(({ batiment: b }) => (
              <option key={b.id} value={b.id}>{b.nom}</option>
            ))}
          </select>
        </label>
      </section>

      <section style={{ background: "#f6f6f6" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 24 }}>
          {["doc", "hyp", "obs", "none"].map((k) => (
            <div key={k} style={{ background: "#fff", padding: 24, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 6px 18px rgba(0,0,18,.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Tag st={k} />
                <span style={{ fontSize: 28, fontWeight: 800, color: "#161616", fontVariantNumeric: "tabular-nums" }}>{counts[k]}</span>
              </div>
              <span style={{ fontSize: 14, lineHeight: 1.55 }}>{STATUS_TXT[k]}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 32px 112px", display: "flex", gap: "clamp(24px,4vw,64px)", alignItems: "flex-start", flexWrap: "wrap" }}>
        <aside style={{ flex: "1 1 220px", maxWidth: 280, minWidth: 200, position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, paddingBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#161616" }}>Sommaire</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer : hauteur, E.3…" style={{ ...FIELD_INPUT, padding: "8px 12px", fontSize: 14 }} />
          <a href={`#${bs}--sources`} onClick={go(`${bs}--sources`)} style={{ fontSize: 14, fontWeight: 500, color: "#161616", textDecoration: "none", paddingLeft: 12 }}>
            Documents sources
          </a>
          {rubs.map((g) => (
            <div key={g.k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#161616", padding: "0 0 6px 12px" }}>{g.k} · {g.t}</span>
              {g.items.map((x) => {
                const on = isOn(x.anchor);
                return (
                  <a key={x.anchor} href={`#${x.anchor}`} onClick={go(x.anchor)} style={{ display: "flex", gap: 10, borderLeft: `2px solid ${on ? "#000091" : "transparent"}`, padding: "5px 12px", fontSize: 14, color: on ? "#000091" : "#3a3a3a", textDecoration: "none" }}>
                    <span className="code-mono" style={{ fontSize: 12, color: "#888", paddingTop: 2, flex: "none" }}>{x.code}</span>
                    <span>{x.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </aside>

        <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 64 }}>
          <section id={`${bs}--sources`} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 style={H2}>Documents sources</h2>
            {docs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #ddd" }}>
                {docs.map((d) => {
                  const a = srcA(d.c);
                  return (
                    <div key={d.c} id={a} style={{ display: "grid", gridTemplateColumns: "72px minmax(0,2fr) auto", gap: 20, alignItems: "baseline", padding: "16px 8px", borderBottom: "1px solid #eee", background: hl === a ? "#f5f5fe" : "transparent", transition: "background .8s" }}>
                      <span className="code-mono" style={{ fontSize: 13, fontWeight: 700, color: "#000091" }}>{d.c}</span>
                      <a href={d.url} target="_blank" rel="noreferrer" style={{ fontSize: 15, fontWeight: 500 }}>{d.t} ↗</a>
                    </div>
                  );
                })}
              </div>
            ) : (
              <span style={{ fontSize: 15, color: "#666" }}>Aucun document reçu.</span>
            )}
          </section>

          {rubs.map((g) => (
            <div key={g.k} id={g.anchor} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <h2 style={H2}>{g.k} · {g.t}</h2>
              {g.items.map((x) => {
                const on = isOn(x.anchor);
                const sd = x.fieldDoc.src && docs.find((d) => d.t.toLowerCase().includes(x.fieldDoc.src!.toLowerCase().split(" ")[0].toLowerCase()));
                return (
                  <article key={x.anchor} id={x.anchor} style={{ background: on ? "#f5f5fe" : "#fff", border: `1px solid ${on ? "#000091" : "#e5e5e5"}`, padding: 32, display: "flex", flexDirection: "column", gap: 24, transition: "background .8s, border-color .8s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span className="code-mono" style={{ fontSize: 13, fontWeight: 700, color: "#000091", background: "#f5f5fe", padding: "2px 8px" }}>{x.code}</span>
                          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#161616" }}>{x.label}</h3>
                        </div>
                        {x.value && <span style={{ fontSize: 15 }}>Valeur : <strong style={{ color: "#161616", fontWeight: 500 }}>{x.value}</strong></span>}
                      </div>
                      <Tag st={x.st} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "20px 32px", borderTop: "1px solid #eee", borderBottom: "1px solid #eee", padding: "20px 0" }}>
                      <Meta k="Source">{sd ? <a href={`#${srcA(sd.c)}`} onClick={go(srcA(sd.c))}>{sd.c} — {sd.t}</a> : x.fieldDoc.src ?? (x.fieldDoc.meth === "Calcul" ? "Calcul SDTE" : "—")}</Meta>
                      <Meta k="Référence précise">{x.fieldDoc.ref}</Meta>
                      <Meta k="Méthode">{x.fieldDoc.meth}</Meta>
                      <Meta k="Fiabilité">{x.fieldDoc.fiab}</Meta>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#161616" }}>{x.st !== "none" ? "Procédure" : "Procédure prévue"}</span>
                      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                        {x.fieldDoc.steps.map((t, j) => (
                          <li key={j} style={{ display: "flex", gap: 14, fontSize: 15, lineHeight: 1.55 }}>
                            <span style={{ flex: "none", width: 24, height: 24, borderRadius: "50%", background: "#e3e3fd", color: "#000091", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{j + 1}</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {x.fieldDoc.lim && <Box title="Limites connues">{x.fieldDoc.lim}</Box>}
                    {x.st === "none" && x.fieldDoc.expect && <Box title="Document attendu">{x.fieldDoc.expect}</Box>}

                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
                      <button onClick={() => copy(x.anchor)} style={{ background: "none", border: 0, padding: 0, color: "#000091", fontSize: 14, textDecoration: "underline", textUnderlineOffset: 4, cursor: "pointer" }}>
                        {copied === x.anchor ? "Lien copié" : "Copier le lien"}
                      </button>
                      <a href="#" onClick={(e) => { e.preventDefault(); router.push(`/batiments/${batiment.id}`); }}>Voir dans la fiche bâtiment</a>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
