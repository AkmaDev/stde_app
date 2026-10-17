"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Batiment, climatisationDetectee, zeroEstSuspect } from "@/lib/api";

const MOIS_LABEL: Record<number, string> = {
  1: "Janv", 2: "Fév", 3: "Mars", 4: "Avr", 5: "Mai", 6: "Juin",
  7: "Juil", 8: "Août", 9: "Sept", 10: "Oct", 11: "Nov", 12: "Déc",
};

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR");
}

function makeDot(energie: string) {
  return (props: any) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null) return <g key={`dot-${index}`} />;
    const val = payload[energie];
    if (val == null) return <g key={`dot-${index}`} />;
    const suspect = zeroEstSuspect(val, payload.mois, energie);
    if (!suspect) return <g key={`dot-${index}`} />;
    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={5} fill="white" stroke="#C0503F" strokeWidth={2} />;
  };
}

export default function ConsommationMensuelleChart({ batiment }: { batiment: Batiment }) {
  const mensuelles = batiment.consommations_mensuelles;
  if (!mensuelles || mensuelles.length === 0) {
    return (
      <div>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Consommation mensuelle</h2>
        <p style={{ margin: "8px 0 0", fontSize: 16 }}>Aucune facture mensuelle disponible pour ce bâtiment.</p>
      </div>
    );
  }

  const energies = Array.from(new Set(mensuelles.map((m) => m.energie))).sort((a, b) =>
    a === "Électricité" ? -1 : b === "Électricité" ? 1 : 0
  );
  const autreEnergie = energies.find((e) => e !== "Électricité") ?? null;
  const moisTries = Array.from(new Set(mensuelles.map((m) => m.mois))).sort();

  const data = moisTries.map((mois) => {
    const point: any = { mois };
    for (const e of energies) {
      const found = mensuelles.find((m) => m.mois === mois && m.energie === e);
      point[e] = found ? found.kwh : null;
    }
    const [y, m] = mois.split("-");
    point.label = `${MOIS_LABEL[parseInt(m, 10)]} ${y.slice(2)}`;
    return point;
  });

  const bandesEte: { x1: string; x2: string }[] = [];
  let debut: string | null = null;
  for (let i = 0; i < data.length; i++) {
    const m = parseInt(data[i].mois.split("-")[1], 10);
    const estEte = [6, 7, 8].includes(m);
    if (estEte && debut == null) debut = data[i].mois;
    if (!estEte && debut != null) {
      bandesEte.push({ x1: debut, x2: data[i - 1].mois });
      debut = null;
    }
  }
  if (debut != null) bandesEte.push({ x1: debut, x2: data[data.length - 1].mois });

  const clim = climatisationDetectee(batiment);
  const nbManquants = energies.reduce(
    (acc, e) => acc + moisTries.filter((mo) => !mensuelles.some((m) => m.mois === mo && m.energie === e)).length,
    0
  );
  const nbSuspects = mensuelles.filter((m) => zeroEstSuspect(m.kwh, m.mois, m.energie)).length;

  // Dernière année calendaire complète (12 mois) présente dans les données --
  // pas "2025" en dur, variable selon le bâtiment.
  const anneesCompletes = Array.from(new Set(moisTries.map((m) => m.split("-")[0]))).filter(
    (y) => moisTries.filter((m) => m.startsWith(y)).length === 12
  );
  const derniereAnnee = anneesCompletes.sort().slice(-1)[0] ?? null;
  const mwhAnnee = (energie: string) => {
    if (!derniereAnnee) return "—";
    const total = mensuelles
      .filter((m) => m.energie === energie && m.mois.startsWith(derniereAnnee))
      .reduce((a, m) => a + m.kwh, 0);
    return (total / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  };

  const stats: [string, string, string][] = [
    [`Électricité ${derniereAnnee ?? ""}`, mwhAnnee("Électricité"), "MWh"],
    autreEnergie ? [`${autreEnergie} ${derniereAnnee ?? ""}`, mwhAnnee(autreEnergie), "MWh"] : ["Autre énergie", "—", ""],
    ["Mois sans facture", String(nbManquants), `sur ${moisTries.length * energies.length}`],
    ["Valeurs nulles suspectes", String(nbSuspects), ""],
  ];
  const series = [["Électricité", "Électricité"], autreEnergie ? [autreEnergie, autreEnergie] : null].filter(Boolean) as [string, string][];
  const periodeLabel = (mois: string) => {
    const [y, m] = mois.split("-");
    return `${MOIS_LABEL[parseInt(m, 10)]} ${y}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 600 }}>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Consommation mensuelle</h2>
        <p style={{ margin: 0, fontSize: 16 }}>
          D&apos;après les factures reçues, de {periodeLabel(moisTries[0])} à {periodeLabel(moisTries[moisTries.length - 1])}. Chaque énergie a sa propre échelle. Les bandes grises marquent juin à août.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 32, borderTop: "1px solid #ddd", borderBottom: "1px solid #ddd", padding: "24px 0" }}>
        {stats.map(([k, v, u]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 14, color: "#666" }}>{k}</span>
            <span className="num" style={{ fontSize: 22, fontWeight: 800, color: "#161616" }}>
              {v} <span style={{ fontSize: 14, fontWeight: 400, color: "#666" }}>{u}</span>
            </span>
          </div>
        ))}
      </div>

      {clim && (
        <div style={{ fontSize: 13, color: "#C0503F" }}>
          Climatisation probable · été {fmt(clim.moyEte)} / hiver {fmt(clim.moyHiver)} kWh/mois (+{clim.ecartPct}%) — consommation électrique
          moyenne de juin à août supérieure d&apos;au moins 10 % à celle de décembre à février.
        </div>
      )}

      {series.map(([name, key]) => (
        <section key={name} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#161616" }}>{name}</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eee" vertical={false} />
              {bandesEte.map((b, i) => (
                <ReferenceArea key={i} x1={b.x1} x2={b.x2} fill="#f6f6f6" />
              ))}
              <XAxis
                dataKey="mois"
                tickFormatter={(mois: string) => data.find((d) => d.mois === mois)?.label ?? mois}
                tick={{ fontSize: 11, fill: "#666" }}
                interval={Math.ceil(data.length / 10)}
                axisLine={{ stroke: "#ddd" }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #e5e5e5", borderRadius: 4 }}
                formatter={(value: any) => [value == null ? "—" : `${fmt(value)} kWh`, name]}
                labelFormatter={(mois: any) => data.find((d) => d.mois === mois)?.label ?? mois}
              />
              <Line type="monotone" dataKey={key} name={name} stroke="#000091" strokeWidth={2} dot={makeDot(key)} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>
      ))}

      <div style={{ background: "#f6f6f6", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, fontSize: 14, lineHeight: 1.55, maxWidth: 720 }}>
        <span style={{ fontWeight: 700, color: "#161616" }}>Lecture</span>
        <span>
          Une interruption de la courbe signale un mois sans facture ({nbManquants} cas). Un point cerclé en rouge est une valeur 0 déclarée
          hors saison de chauffe morte (mai-septembre), probablement une facture manquante enregistrée par défaut à 0 ({nbSuspects} cas).
        </span>
      </div>
    </div>
  );
}
