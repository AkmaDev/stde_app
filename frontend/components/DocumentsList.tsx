"use client";

import { useState } from "react";
import { DocumentBatiment } from "@/lib/api";

// Documents attachés au bâtiment (DPE, audits...) — rendu natif du PDF par le
// navigateur via <iframe>, aucune librairie externe.
export default function DocumentsList({ documents }: { documents: DocumentBatiment[] }) {
  const [selected, setSelected] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Documents</h2>
        <p style={{ margin: 0, fontSize: 16 }}>Pièces reçues pour ce bâtiment. Chaque donnée de la fiche renvoie à l&apos;une d&apos;elles.</p>
      </div>

      {documents.length > 0 ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #ddd" }}>
            {documents.map((doc, i) => {
              const actif = i === selected;
              const fichier = doc.url.split("/").pop();
              return (
                <button
                  key={doc.url}
                  onClick={() => setSelected(i)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px minmax(0,2fr)",
                    gap: 20,
                    alignItems: "baseline",
                    padding: "16px 8px",
                    border: 0,
                    borderBottom: "1px solid #eee",
                    borderLeft: `2px solid ${actif ? "#000091" : "transparent"}`,
                    background: actif ? "#f5f5fe" : "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span className="code-mono" style={{ fontSize: 13, fontWeight: 700, color: "#000091" }}>DOC{i + 1}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: "#161616" }}>{doc.label}</span>
                    {fichier && <span style={{ fontSize: 13, color: "#666", overflowWrap: "anywhere" }}>{fichier}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid #ddd" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "12px 16px", borderBottom: "1px solid #ddd", flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "#161616", fontWeight: 500, overflowWrap: "anywhere" }}>
                DOC{selected + 1} — {documents[selected].label}
              </span>
              <span style={{ display: "flex", gap: 20, fontSize: 14 }}>
                <a href={documents[selected].url} target="_blank" rel="noreferrer" style={{ color: "#000091" }}>Ouvrir dans un onglet</a>
                <a href={documents[selected].url} download style={{ color: "#000091" }}>Télécharger</a>
              </span>
            </div>
            <div style={{ height: 520 }}>
              <iframe title={documents[selected].label} src={documents[selected].url} style={{ width: "100%", height: "100%", border: 0 }} />
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: "#f6f6f6", padding: 24, fontSize: 15, display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
          <span style={{ color: "#161616", fontWeight: 500 }}>Aucun document reçu pour ce bâtiment.</span>
        </div>
      )}
    </div>
  );
}
