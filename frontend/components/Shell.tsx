"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Batiment, priorite, prioriteGlobale } from "@/lib/api";
import { PRIORITE_DOT, PRIORITE_LABEL, CRITERES_LABEL } from "@/lib/ui";

const NAV_ITEMS_BASE = [
  { label: "Vue d'ensemble", href: "/" },
  { label: "Indicateurs globaux", href: "/indicateurs" },
  { label: "Comparateur de leviers", href: "/comparateur" },
];

export default function Shell({
  buildings,
  children,
}: {
  buildings: { batiment: Batiment }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const nbDocumentes = buildings.filter((b) => b.batiment.conso_mesuree_kwh_m2 != null).length;

  const q = query.trim().toLowerCase();
  const results = q
    ? buildings
        .filter(
          ({ batiment }) =>
            batiment.nom.toLowerCase().includes(q) || batiment.arrondissement.toLowerCase().includes(q)
        )
        .slice(0, 6)
    : [];

  function ouvrir(id: number) {
    setQuery("");
    router.push(`/batiments/${id}`);
  }

  // "Fiche bâtiment" n'a pas de cible fixe (pas de bâtiment "courant" entre les
  // pages) -- pointe vers celui de plus haute priorité, cohérent avec le
  // bouton équivalent de l'accueil plutôt qu'une page vide.
  const prioritaire = [...buildings]
    .map((b) => ({ ...b, pg: prioriteGlobale(b.batiment) }))
    .filter((b): b is typeof b & { pg: NonNullable<typeof b.pg> } => b.pg != null)
    .sort((a, b) => b.pg.valeur - a.pg.valeur)[0];
  const navItems = [
    NAV_ITEMS_BASE[0],
    { label: "Fiche bâtiment", href: prioritaire ? `/batiments/${prioritaire.batiment.id}` : "/", match: "/batiments" },
    ...NAV_ITEMS_BASE.slice(1),
    { label: "Documentation", href: prioritaire ? `/documentation/${prioritaire.batiment.id}` : "/", match: "/documentation" },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <Link href="/" className="logo-block">
            <span className="logo">sdte</span>
            <span className="logo-sub">
              <span className="t">Données énergétiques du parc</span>
              <span className="s">Ville de Paris · Service des bâtiments culturels</span>
            </span>
          </Link>
          <div className="topbar-right">
            <div className="topbar-stats">
              <span>165 bâtiments</span>
              <span>{nbDocumentes} documentés</span>
            </div>
            <div className="search-wrap">
              <div style={{ display: "flex", width: 384, maxWidth: "100%" }}>
                <input
                  type="text"
                  className="search"
                  placeholder="Rechercher un bâtiment"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && results[0]) ouvrir(results[0].batiment.id);
                  }}
                />
                <button
                  type="button"
                  className="search-btn"
                  onClick={() => results[0] && ouvrir(results[0].batiment.id)}
                  aria-label="Rechercher"
                >
                  ⌕
                </button>
              </div>
              {results.length > 0 && (
                <div className="search-results">
                  <div className="blist">
                    {results.map(({ batiment }) => {
                      const pg = prioriteGlobale(batiment);
                      const dotClass = pg == null ? "n" : PRIORITE_DOT[priorite(pg.valeur)];
                      const title =
                        pg == null
                          ? "Priorité non calculable (Risque indisponible — pas de DPE/consommation connue)"
                          : `Priorité ${PRIORITE_LABEL[priorite(pg.valeur)]} — basée sur ${pg.criteres.map((c) => CRITERES_LABEL[c]).join(" + ")}`;
                      return (
                        <button
                          key={batiment.id}
                          type="button"
                          className="bitem"
                          style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                          onClick={() => ouvrir(batiment.id)}
                        >
                          <span className={`dot ${dotClass}`} title={title}></span>
                          {batiment.nom}
                          <span className="meta">{batiment.arrondissement}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="nav2">
          <div className="nav2-row">
            {navItems.map((item) => {
              const active = "match" in item ? pathname.startsWith(item.match as string) : pathname === item.href;
              return (
                <Link key={item.label} href={item.href} className={`nav2-item${active ? " on" : ""}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="main">{children}</div>

      <footer className="footbar">
        <div className="footer-main">
          <div className="footer-brand">
            <span className="logo" style={{ fontSize: 24 }}>sdte</span>
            <p>Énergie finale, surface de référence OPERAT. Consommations mesurées : moyenne glissante sur les années calendaires complètes 2023-2025, quand les factures le permettent.</p>
          </div>
          <div className="footer-cols">
            <div className="footer-col">
              <span className="footer-col-title">Plateforme</span>
              <Link href="/">Vue d&apos;ensemble</Link>
              <Link href="/indicateurs">Indicateurs globaux</Link>
              <Link href="/comparateur">Comparateur de leviers</Link>
            </div>
          </div>
        </div>
        <div className="footbar-row">SDTE v0.1 — prototype d&apos;aide à la décision · Ville de Paris, Service SBC</div>
      </footer>
    </div>
  );
}
