"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Batiment, LigneLevierBatiment, climatisationDetectee, zeroEstSuspect } from "@/lib/api";
import { ETAT_LABEL } from "@/lib/ui";
import { PALIERS, R2_MIN, posteDuLevier, simulerTrajectoire, type MoisMeteo } from "@/lib/trajectoire";
import meteoJson from "@/data/meteo_paris_montsouris.json";

// Graphe du tableau blanc de Jean : température extérieure, chauffage avant
// et après leviers, bande réglementaire 19-26 °C, et avancement vers les
// paliers −40/−50/−60 %. Toutes les hypothèses sont listées sous le graphe.

const MOIS = ["Janv", "Fév", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const meteo = meteoJson.mois as MoisMeteo[];
const HYP: [string, string] = ["#716043", "#feecc2"];

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const mwh = (n: number) => (n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const pct = (x: number) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 500, color: HYP[0], background: HYP[1], padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export default function TrajectoireTab({ batiment, leviers }: { batiment: Batiment; leviers: LigneLevierBatiment[] }) {
  const [actifs, setActifs] = useState<Set<number>>(new Set());
  const clim = climatisationDetectee(batiment) != null;
  const exclure = (f: { mois: string; energie: string; kwh: number }) => zeroEstSuspect(f.kwh, f.mois, f.energie);

  const r = useMemo(
    () => simulerTrajectoire(batiment.consommations_mensuelles, meteo, leviers.filter((l) => actifs.has(l.levier.id)), clim, exclure),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batiment, leviers, actifs, clim]
  );

  const basculer = (id: number) =>
    setActifs((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const titre = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 720 }}>
      <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#161616" }}>Trajectoire énergétique</h2>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>
        Activez les leviers pour voir comment le chauffage baisse mois par mois, et où en est le bâtiment par rapport aux objectifs du
        décret tertiaire (−40 % en 2030, −50 % en 2040, −60 % en 2050).
      </p>
    </div>
  );

  if ("erreur" in r) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {titre}
        <div style={{ background: "#fff4f3", border: "1px solid #f3c5bf", padding: "16px 20px", fontSize: 15, maxWidth: 720 }}>
          Calcul impossible pour ce bâtiment : {r.erreur}
        </div>
      </div>
    );
  }

  const simulables = leviers.filter((l) => {
    const poste = posteDuLevier(l.levier.poste_concerne);
    return l.etat === "applicable" && poste !== "non_simule" && (poste !== "climatisation" || r.climatisationModelisee);
  });

  const data = r.points.map((p) => ({
    label: MOIS[p.mois - 1],
    tm: p.tm,
    chauffage: Math.round(p.chauffage),
    apres: [Math.round(p.chauffageApres[0]), Math.round(p.chauffageApres[1])],
    climatisation: Math.round(p.climatisation),
  }));
  const chauffageNul = r.points.every((p) => p.chauffage === 0);
  const plusieursAnnees = r.annee !== String(new Date().getFullYear() - 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {titre}

      {/* Leviers */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#161616" }}>Leviers</h3>
          {simulables.length > 0 && (
            <button
              type="button"
              onClick={() => setActifs(actifs.size === simulables.length ? new Set() : new Set(simulables.map((l) => l.levier.id)))}
              style={{ fontSize: 14, color: "#000091", background: "none", border: "1px solid #000091", padding: "4px 12px", cursor: "pointer" }}
            >
              {actifs.size === simulables.length ? "Tout désactiver" : "Tout activer"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #ddd" }}>
          {leviers.map((l) => {
            const poste = posteDuLevier(l.levier.poste_concerne);
            const activable =
              l.etat === "applicable" && poste !== "non_simule" && (poste !== "climatisation" || r.climatisationModelisee);
            const note =
              l.etat === "deja_realise"
                ? "Déjà réalisé : son effet est déjà dans les factures."
                : l.etat !== "applicable"
                  ? `${ETAT_LABEL[l.etat]}${l.commentaire ? ` : ${l.commentaire}` : ""}`
                  : poste === "non_simule"
                    ? "Non simulé : la part de l'éclairage dans l'électricité n'est pas connue."
                    : poste === "climatisation" && !r.climatisationModelisee
                      ? "Agit sur la climatisation, non détectée dans les factures de ce bâtiment : effet nul ici."
                      : `Agit sur la part ${poste} · ${l.levier.source}`;
            return (
              <label
                key={l.levier.id}
                style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1.2fr) 110px minmax(0,2.4fr)", gap: 16, alignItems: "start", padding: "14px 0", borderBottom: "1px solid #eee", opacity: activable ? 1 : 0.55, cursor: activable ? "pointer" : "default" }}
              >
                <input type="checkbox" disabled={!activable} checked={actifs.has(l.levier.id)} onChange={() => basculer(l.levier.id)} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 16, fontWeight: 500, color: "#161616" }}>{l.levier.nom}</span>
                <span className="num" style={{ fontSize: 15, color: "#161616", whiteSpace: "nowrap" }}>
                  −{l.levier.gain_min_pct} à −{l.levier.gain_max_pct} %
                </span>
                <span style={{ fontSize: 14, color: "#3a3a3a", lineHeight: 1.5 }}>{note}</span>
              </label>
            );
          })}
        </div>
      </section>

      {/* Avancement */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#161616" }}>Avancement vers les objectifs</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, maxWidth: 720 }}>
          Référence {r.annee} : <b>{mwh(r.reference)} MWh</b> (toutes énergies, d&apos;après les factures).{" "}
          {actifs.size === 0 ? (
            "Aucun levier activé."
          ) : (
            <>
              Économie simulée : <b>{pct(r.reductionMin)} à {pct(r.reductionMax)}</b>, soit {mwh(r.reference - r.simuleMin)} à{" "}
              {mwh(r.reference - r.simuleMax)} MWh par an.
            </>
          )}{" "}
          <Tag>Référence provisoire</Tag>
        </p>
        <div style={{ position: "relative", height: 36, background: "#f0f0f0", maxWidth: 720 }}>
          <div
            title="Fourchette d'économie simulée (gain minimum à gain maximum)"
            style={{ position: "absolute", top: 8, bottom: 8, left: `${Math.min(r.reductionMin, 1) * 100}%`, width: `${Math.max(0, Math.min(r.reductionMax, 1) - Math.min(r.reductionMin, 1)) * 100}%`, background: "#18753c", opacity: 0.35 }}
          />
          <div style={{ position: "absolute", top: 8, bottom: 8, left: 0, width: `${Math.min(r.reductionMin, 1) * 100}%`, background: "#18753c" }} />
          {PALIERS.map((p) => (
            <div key={p.annee} style={{ position: "absolute", top: 0, bottom: 0, left: `${p.reduction * 100}%`, borderLeft: "2px solid #C0503F" }}>
              <span style={{ position: "absolute", top: 38, left: -16, fontSize: 12, color: "#C0503F", whiteSpace: "nowrap" }}>
                −{p.reduction * 100} %
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 20, fontSize: 14 }}>
          {PALIERS.map((p) => {
            const statut = r.reductionMin >= p.reduction ? "atteint" : r.reductionMax >= p.reduction ? "atteint seulement avec le gain maximum" : "non atteint";
            return (
              <span key={p.annee}>
                <b>{p.annee}</b> (−{p.reduction * 100} %) : {statut}
              </span>
            );
          })}
        </div>
      </section>

      {/* Graphe */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#161616" }}>Chauffage et température, mois par mois ({r.annee})</h3>
        {chauffageNul && (
          <p style={{ margin: 0, fontSize: 14, color: "#C0503F", maxWidth: 720 }}>
            Aucune part chauffage n&apos;a pu être isolée dans les factures de ce bâtiment (voir les hypothèses ci-dessous) : les leviers
            chauffage n&apos;ont donc aucun effet simulé.
          </p>
        )}
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="#eee" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#666" }} axisLine={{ stroke: "#ddd" }} tickLine={false} />
            <YAxis yAxisId="kwh" tick={{ fontSize: 11, fill: "#666" }} tickFormatter={(v: number) => fmt(v)} width={70} label={{ value: "kWh / mois", angle: -90, position: "insideLeft", fontSize: 12, fill: "#666" }} />
            <YAxis yAxisId="temp" orientation="right" domain={[-5, 35]} tick={{ fontSize: 11, fill: "#666" }} width={40} label={{ value: "°C", angle: 90, position: "insideRight", fontSize: 12, fill: "#666" }} />
            <ReferenceArea yAxisId="temp" y1={19} y2={26} fill="#C0503F" fillOpacity={0.12} stroke="#C0503F" strokeOpacity={0.5} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: "1px solid #e5e5e5", borderRadius: 4 }}
              formatter={(value: any, name: any) => {
                if (Array.isArray(value)) return [`${fmt(value[0])} à ${fmt(value[1])} kWh`, name];
                if (name === "Température extérieure") return [`${Number(value).toFixed(1)} °C`, name];
                return [`${fmt(value)} kWh`, name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {actifs.size > 0 && (
              <Area yAxisId="kwh" dataKey="apres" name="Chauffage après leviers (min–max)" fill="#999" stroke="#777" fillOpacity={0.35} isAnimationActive={false} />
            )}
            <Line yAxisId="kwh" dataKey="chauffage" name="Chauffage estimé (factures)" stroke="#18753c" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {r.climatisationModelisee && (
              <Line yAxisId="kwh" dataKey="climatisation" name="Climatisation estimée" stroke="#b34000" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            )}
            <Line yAxisId="temp" dataKey="tm" name="Température extérieure" stroke="#0063cb" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p style={{ margin: 0, fontSize: 14, color: "#3a3a3a", lineHeight: 1.55, maxWidth: 720 }}>
          La bande rouge (axe de droite) va de 19 °C à 26 °C. Ce sont les seuils réglementaires de l&apos;air intérieur : au plus 19 °C en
          moyenne quand on chauffe (Code de l&apos;énergie, art. R241-26), pas de climatisation tant que l&apos;intérieur ne dépasse pas
          26 °C (art. R241-30). Ce sont des températures de consigne, pas la température ressentie, qui dépend aussi de celle des murs et
          des vitrages. Les travaux ne changent pas cette bande : ils réduisent l&apos;énergie nécessaire pour y rester. L&apos;écart entre
          la courbe bleue et la bande montre le besoin : chauffer en hiver, rafraîchir en été.
        </p>
      </section>

      {/* Hypothèses */}
      <section style={{ background: "#f6f6f6", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, fontSize: 14, lineHeight: 1.55, maxWidth: 820 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: "#161616" }}>Hypothèses et choix</span>

        <div>
          <Tag>Hypothèse</Tag> <b>Séparer le chauffage du reste.</b> Les factures ne disent pas à quoi sert l&apos;énergie. On compare chaque
          mois de facture au froid du mois (degrés-jours, Météo-France, Paris-Montsouris) :
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {r.signatures.map((s) => (
              <li key={s.energie}>
                <b>{s.energie}</b> :{" "}
                {s.methode === "tout_chauffage"
                  ? s.chauffageDetecte
                    ? `comptée à 100 % en chauffage. Le lien avec le froid le confirme (R² = ${s.r2.toFixed(2)} sur ${s.nbMois} mois).`
                    : `pas comptée en chauffage : ${s.raison}.`
                  : s.chauffageDetecte
                    ? `part chauffage estimée à ${fmt(s.b)} kWh par degré-jour, le reste est le talon (éclairage, équipements, eau chaude)${s.climModelisee ? `, plus ${fmt(s.c)} kWh par degré-jour de climatisation` : ""}. R² = ${s.r2.toFixed(2)} sur ${s.nbMois} mois.`
                    : `aucune part chauffage retenue : ${s.raison}.`}
              </li>
            ))}
          </ul>
          <span style={{ color: "#666" }}>
            Vapeur et gaz sont comptés entièrement en chauffage, car dans ces bibliothèques ils ne servent pratiquement qu&apos;à ça. On ne le
            fait que si leur consommation suit bien le froid (R² ≥ {R2_MIN}). Pour l&apos;électricité, qui sert à tout, la part chauffage est
            celle qui augmente avec le froid.
          </span>
        </div>

        <div>
          <Tag>Hypothèse</Tag> <b>Cumul des leviers.</b> Deux leviers de 10 % donnent 19 %, pas 20 % : le second s&apos;applique à ce qui
          reste après le premier. Chaque levier est pris dans sa fourchette ADEME, du gain minimum au gain maximum, d&apos;où la zone grise.
        </div>

        <div>
          <Tag>Hypothèse</Tag> <b>Postes.</b> Les leviers « chauffage, ventilation » ne réduisent ici que le chauffage : la ventilation
          n&apos;est pas séparable dans les factures. La protection solaire n&apos;agit que sur la climatisation (son léger effet sur le
          chauffage d&apos;hiver n&apos;est pas compté). Le relamping LED n&apos;est pas simulé faute de connaître la part de l&apos;éclairage.
        </div>

        <div>
          <Tag>Référence provisoire</Tag> <b>Année de référence {r.annee}.</b> C&apos;est la dernière année où toutes les énergies du bâtiment ont
          leurs 12 factures{plusieursAnnees ? " (l'année la plus récente est incomplète)" : ""}. Le décret tertiaire mesure l&apos;objectif par
          rapport à une année choisie par la Ville et déclarée sur la plateforme OPERAT : elle remplacera celle-ci dès qu&apos;on la connaîtra.
        </div>

        {r.facturesExclues > 0 && (
          <div>
            <b>Factures écartées.</b> {r.facturesExclues} facture{r.facturesExclues > 1 ? "s" : ""} à 0 kWh en saison de chauffe (ou
            d&apos;électricité) {r.facturesExclues > 1 ? "sont traitées" : "est traitée"} comme manquante{r.facturesExclues > 1 ? "s" : ""} : il
            s&apos;agit plus probablement d&apos;une facture pas encore reçue que d&apos;une vraie absence de consommation.
          </div>
        )}

        {r.moisPlafonnes.length > 0 && (
          <div style={{ color: "#C0503F" }}>
            Mois où le modèle dépassait la facture, parts réduites à la facture : {r.moisPlafonnes.join(", ")}.
          </div>
        )}

        <span style={{ color: "#666", fontSize: 13 }}>
          Température : Météo-France, données climatologiques quotidiennes, station Paris-Montsouris, moyenne de (min + max) / 2 par jour.
        </span>
      </section>
    </div>
  );
}
