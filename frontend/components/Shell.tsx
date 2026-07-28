"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Batiment, Score, priorite } from "@/lib/api";

const DOT_CLASS: Record<string, string> = {
  elevee: "r",
  moyenne: "o",
  faible: "g",
};

export default function Shell({
  buildings,
  children,
}: {
  buildings: { batiment: Batiment; score: Score }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">SDTE<span>.</span></div>
        <div className="sub">Système de traitement des données énergétiques &nbsp;·&nbsp; Ville de Paris — SBC</div>
        <div className="right">
          <div>Parc : 165 bâtiments</div>
          <div>Documentés : {buildings.length}</div>
          <div className="pill-user">R. — Service SBC</div>
        </div>
      </div>
      <div className="body">
        <div className="side">
          <h3>Bâtiments — DAC</h3>
          <div className="search">⌕&nbsp; Rechercher un bâtiment…</div>
          <div className="blist">
            {buildings.map(({ batiment, score }) => {
              const href = `/batiments/${batiment.id}`;
              const active = pathname === href;
              const dotClass = batiment.conso_mesuree_kwh_m2 == null ? "n" : DOT_CLASS[priorite(score.sct)];
              return (
                <Link key={batiment.id} href={href} className={`bitem${active ? " on" : ""}`}>
                  <span className={`dot ${dotClass}`}></span>
                  {batiment.nom}
                  <span className="meta">{batiment.arrondissement}</span>
                </Link>
              );
            })}
          </div>
          <div className="sidefoot">
            <Link href="/" className="btn">VISION PARC</Link>
            <Link href="/comparateur" className="btn ghost">Comparateur de leviers</Link>
          </div>
        </div>
        <div className="main">{children}</div>
      </div>
      <div className="footbar">
        <div className="demo">JEU DE DÉMONSTRATION</div>
        <div>Millésime conso. 2023 — moyenne glissante 3 ans</div>
        <div>Énergie finale · surface de référence OPERAT</div>
        <div className="r">SDTE v0.1 — prototype d'aide à la décision · ne se substitue pas aux études préalables</div>
      </div>
    </div>
  );
}
