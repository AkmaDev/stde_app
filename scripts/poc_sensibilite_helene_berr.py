"""
POC -- Brique 5 (Sensibilite unitaire) sur Helene Berr, suite directe de
poc_bilan_horaire_helene_berr.py (Brique 3, deja ferme avec comparaison a la
conso reelle). Mesure l'effet isole de 2 leviers du catalogue existant
(frontend/data/leviers.json), les seuls simulables avec notre modele
(enveloppe seule -- transmission + solaire, pas de ventilation/eclairage/
rendement systeme) :

  - Isolation facade : U_mur actuel (0.40 W/m2.K, DPE Helene Berr section
    3.1.1) -> U_mur isole, meme intervention que proposee par le DPE
    lui-meme (section 3.1.3, 2 options intourieur/exterieur -- meme materiau
    et meme effet thermique dans ce modele simplifie) : fibre de bois, 12 cm,
    lambda=0.049 W/m.K, soit une resistance ajoutee R = 0.12 / 0.049 = 2.449
    m2.K/W.
    U_isole = 1 / (1/U_mur + R) = 1 / (1/0.40 + 2.449) = 0.202 W/m2.K.
    Investissement DPE : 75 001-200 000 EUR selon option, 1.5-1.7% EP
    declare (reference DPE, pas un calcul de ce script). Deja qualifie
    "deja_realise" dans frontend/data/levier/4.json (murs deja isoles) --
    cette simulation sert a verifier si ce jugement qualitatif tient
    physiquement (gain marginal attendu faible).

  - Protection solaire : deja present comme scenario "store exterieur" dans
    poc_bilan_horaire_helene_berr.py (F_PROTECTION_STORE_EXT=0.09,
    ES-SO/ACTIBAIE) -- Brique 5 en extrait l'effet isole proprement (hiver
    vs ete separes).

Regle de la brique (une seule variable modifiee par test) : chaque variante
ne change qu'un seul parametre par rapport a la baseline (U_mur actuel, pas
de protection), pour chacun des 2 scenarios U_vitrage deja presents dans
poc_bilan_horaire_helene_berr.py (ambiguite DPE non tranchee, gardee telle
quelle ; g fixe a 0.75, pas d'ambiguite de type pour ce batiment).

Metriques (pas un chiffre unique "energie" -- hiver/ete separes, conforme a
la sortie SENSITIVITY_MATRIX attendue par la brique) :
  - besoin_chauffage_kwh : somme des mois ou solde_kwh < 0 (valeur absolue)
    -- proxy du besoin reel de chauffage (tient compte des apports solaires
    deja compensateurs, plus pertinent que la transmission brute).
  - apport_ete_kwh : somme des apports solaires juin-aout -- proxy du risque
    de surchauffe estivale / confort ete.
  - confort : non calculable avec ce modele (aucune metrique de confort
    thermique implementee) -- jamais de valeur inventee.

Lecture seule : ne modifie aucun fichier de frontend/data/. Rapport texte +
export JSON uniquement.

Usage : python poc_sensibilite_helene_berr.py
"""

import json
import os

import poc_bilan_horaire_helene_berr as pbh

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

U_MUR_ISOLE = round(1 / (1 / pbh.U_MUR + 2.449), 3)  # 0.202 W/m2.K
COUT_INDICATIF_ISOLATION = "75 001-200 000 EUR HT selon option, 1.5-1.7% EP declare (estimation DPE, pas un calcul Brique 5)"
COUT_INDICATIF_PROTECTION = "Non chiffre dans le DPE pour ce batiment -- pas de valeur inventee."


def besoin_chauffage_kwh(agg):
    return round(sum(-agg[m]["solde_kwh"] for m in range(1, 13) if agg[m]["solde_kwh"] < 0), 1)


def apport_ete_kwh(agg):
    return round(sum(agg[m]["solaire_kwh"] for m in (6, 7, 8)), 1)


def classe(delta_pct):
    """delta_pct > 0 = amelioration (baisse du besoin/de l'apport indesirable).
    Un delta quasi nul (ex. U_mur n'a aucun effet sur l'apport solaire, qui ne
    depend que du vitrage) est "sans effet", pas "defavorable" -- les deux ne
    doivent pas etre confondus."""
    if abs(delta_pct) < 0.1:
        return "sans effet"
    if delta_pct >= 15:
        return "fort"
    if delta_pct >= 5:
        return "moyen"
    if delta_pct > 0:
        return "faible"
    return "defavorable"


def delta(baseline, variant):
    if baseline == 0:
        return 0.0
    return round((baseline - variant) / baseline * 100, 1)


def delta_kwh(baseline, variant):
    """Ecart absolu (kWh), positif = amelioration -- a lire a cote du %, qui
    peut etre trompeur sur une petite base (ce batiment est deja isole)."""
    return round(baseline - variant, 1)


def main():
    b = json.load(open(pbh.DATA_PATH, encoding="utf-8"))["batiment"]
    lat, lon, hauteur_m = b["latitude"], b["longitude"], b["hauteur_m"]
    segments = [s for s in b["facade_segments"] if not s["bruit"] and s.get("taux_vitrage_estime_pct") is not None]

    print("=" * 70)
    print(f"POC Brique 5 -- Sensibilite unitaire -- {b['nom']} (id {b['id']})")
    print(f"U_mur actuel = {pbh.U_MUR} W/m2.K -- U_mur isole (DPE, fibre de bois 12cm) = {U_MUR_ISOLE} W/m2.K")
    print("=" * 70)

    resultats_leviers = {"Isolation facade": [], "Protection solaire": []}

    for label_u, u_vitrage in pbh.SCENARIOS_U_VITRAGE.items():
        nom_scenario = label_u
        g = pbh.G

        agg_baseline = pbh.calcule_scenario(segments, hauteur_m, u_vitrage, g, lat, lon)
        base_chauffage = besoin_chauffage_kwh(agg_baseline)
        base_ete = apport_ete_kwh(agg_baseline)

        # --- Isolation facade : monkey-patch U_MUR le temps du calcul ---
        u_mur_origine = pbh.U_MUR
        pbh.U_MUR = U_MUR_ISOLE
        agg_isole = pbh.calcule_scenario(segments, hauteur_m, u_vitrage, g, lat, lon)
        pbh.U_MUR = u_mur_origine
        iso_chauffage = besoin_chauffage_kwh(agg_isole)
        iso_ete = apport_ete_kwh(agg_isole)
        d_chauffage = delta(base_chauffage, iso_chauffage)
        d_ete = delta(base_ete, iso_ete)
        dk_chauffage = delta_kwh(base_chauffage, iso_chauffage)
        dk_ete = delta_kwh(base_ete, iso_ete)
        resultats_leviers["Isolation facade"].append(
            {
                "scenario": nom_scenario,
                "besoin_chauffage_baseline_kwh": base_chauffage,
                "besoin_chauffage_variant_kwh": iso_chauffage,
                "delta_hiver_kwh": dk_chauffage,
                "delta_hiver_pct": d_chauffage,
                "classe_hiver": classe(d_chauffage),
                "apport_ete_baseline_kwh": base_ete,
                "apport_ete_variant_kwh": iso_ete,
                "delta_ete_kwh": dk_ete,
                "delta_ete_pct": d_ete,
                "classe_ete": classe(d_ete),
            }
        )
        print(f"\n[Isolation facade] {nom_scenario}")
        print(f"  Besoin chauffage : {base_chauffage} -> {iso_chauffage} kWh ({dk_chauffage:+.1f} kWh, {d_chauffage:+.1f}%, {classe(d_chauffage)})")
        print(f"  Apport ete       : {base_ete} -> {iso_ete} kWh ({dk_ete:+.1f} kWh, {d_ete:+.1f}%, {classe(d_ete)})")

        # --- Protection solaire : g_eff avec store exterieur ---
        g_eff_protege = g * pbh.F_PROTECTION_STORE_EXT
        agg_protege = pbh.calcule_scenario(segments, hauteur_m, u_vitrage, g_eff_protege, lat, lon)
        prot_chauffage = besoin_chauffage_kwh(agg_protege)
        prot_ete = apport_ete_kwh(agg_protege)
        d_chauffage_p = delta(base_chauffage, prot_chauffage)
        d_ete_p = delta(base_ete, prot_ete)
        dk_chauffage_p = delta_kwh(base_chauffage, prot_chauffage)
        dk_ete_p = delta_kwh(base_ete, prot_ete)
        resultats_leviers["Protection solaire"].append(
            {
                "scenario": nom_scenario,
                "besoin_chauffage_baseline_kwh": base_chauffage,
                "besoin_chauffage_variant_kwh": prot_chauffage,
                "delta_hiver_kwh": dk_chauffage_p,
                "delta_hiver_pct": d_chauffage_p,
                "classe_hiver": classe(d_chauffage_p),
                "apport_ete_baseline_kwh": base_ete,
                "apport_ete_variant_kwh": prot_ete,
                "delta_ete_kwh": dk_ete_p,
                "delta_ete_pct": d_ete_p,
                "classe_ete": classe(d_ete_p),
            }
        )
        print(f"[Protection solaire] {nom_scenario}")
        print(f"  Besoin chauffage : {base_chauffage} -> {prot_chauffage} kWh ({dk_chauffage_p:+.1f} kWh, {d_chauffage_p:+.1f}%, {classe(d_chauffage_p)})")
        print(f"  Apport ete       : {base_ete} -> {prot_ete} kWh ({dk_ete_p:+.1f} kWh, {d_ete_p:+.1f}%, {classe(d_ete_p)})")

    print("\n" + "=" * 70)
    print("RESUME (aucune hypothese cachee) :")
    print(f"  - Isolation facade : U_mur {pbh.U_MUR} -> {U_MUR_ISOLE} W/m2.K (fibre de bois 12cm, proposition DPE)")
    print(f"    Deja qualifie 'deja_realise' dans data/levier/4.json -- verifier si le gain calcule reste faible")
    print(f"    Cout indicatif : {COUT_INDICATIF_ISOLATION}")
    print(f"  - Protection solaire : g x {pbh.F_PROTECTION_STORE_EXT} (store exterieur, ES-SO/ACTIBAIE)")
    print(f"    Cout indicatif : {COUT_INDICATIF_PROTECTION}")
    print("  - Confort : non calculable avec ce modele (pas de metrique de confort thermique implementee)")
    print("  - Une seule variable modifiee par test (U_mur OU g, jamais les deux a la fois)")
    print("=" * 70)

    resultat = {
        "batiment_id": b["id"],
        "batiment_nom": b["nom"],
        "leviers": [
            {
                "nom": "Isolation facade",
                "u_mur_baseline": pbh.U_MUR,
                "u_mur_variant": U_MUR_ISOLE,
                "source_intervention": "DPE Helene Berr section 3.1.3 : fibre de bois, 12cm, lambda=0.049 W/m.K",
                "deja_qualifie_leviers_json": "deja_realise (data/levier/4.json) -- cette simulation verifie si le gain physique reste faible",
                "cout_indicatif": COUT_INDICATIF_ISOLATION,
                "confort": "non calculable avec ce modele",
                "scenarios": resultats_leviers["Isolation facade"],
            },
            {
                "nom": "Protection solaire",
                "g_facteur": pbh.F_PROTECTION_STORE_EXT,
                "source_intervention": "Store exterieur, reference ES-SO/ACTIBAIE (EN14501)",
                "cout_indicatif": COUT_INDICATIF_PROTECTION,
                "confort": "non calculable avec ce modele",
                "scenarios": resultats_leviers["Protection solaire"],
            },
        ],
        "mise_en_garde": (
            "Seuls 2 des 6 leviers du catalogue (frontend/data/leviers.json) sont "
            "simules ici -- les 4 autres (GTB, Relamping LED, Ventilation double "
            "flux, Changement generateur) agissent sur des flux hors du perimetre "
            "de ce modele (ventilation, eclairage, rendement systeme), pas simules "
            "faute de modele physique disponible."
        ),
    }
    out_path = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "helene_berr_sensibilite_brique5.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(resultat, f, ensure_ascii=False, indent=2)
    print(f"\n[export json] {out_path}")


if __name__ == "__main__":
    main()
