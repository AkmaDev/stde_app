"""
POC -- Brique 5 (Sensibilite unitaire) sur Helene Berr. Reecrit le
27/10/2026 suite a l'audit Fable (voir poc_bilan_horaire_helene_berr.py
pour le detail des corrections C8/C10/C12 deja appliquees au modele de
base). Mesure l'effet isole de 3 leviers, tous simulables avec le modele
corrige :

  - Isolation facade : U_mur 0,40 -> 0,202 W/m2.K (DPE section 3.1.3,
    fibre de bois 12cm). Le DPE propose 2 interventions distinctes (ITI
    cote rue 100-200k EUR, ITE cote cour 75-100k EUR, C15) -- meme effet
    physique dans ce modele simplifie (meme lambda/epaisseur), couts
    documentes separement, pas fusionnes.

  - Protection solaire (amelioration interieur -> exterieur) : les
    segments qui ont DEJA des stores interieurs (0, 17, 5 -- g=0,38)
    passent a des stores exterieurs (g=0,10) -- mais SEULEMENT mai a
    septembre (C13, store mobile non deploye en hiver -- le reste de
    l'annee, g reste a la valeur existante 0,38, pas de degradation
    hivernale artificielle). Les segments deja en exterieur (1, 2, 3)
    n'ont plus de levier disponible ici (deja au mieux documente).

  - Remplacement menuiseries : U_vitrage -> 1,80 W/m2.K (DPE section
    3.2.3, proposition d'intervention reelle), compare a chacun des 2
    scenarios DPE actuels (2,0 / 2,6).

Metriques (C14) : besoin_chauffage_kwh reste la mesure energetique reelle
(saison deficitaire) ; apport_ete_kwh est explicitement un indicateur de
RISQUE DE SURCHAUFFE / confort, PAS une economie d'energie -- le DPE
confirme l'absence de climatisation (section 5.3), donc aucune
consommation electrique n'est evitee en reduisant cet apport.

Lecture seule : ne modifie aucun fichier de frontend/data/. Rapport texte
+ export JSON uniquement.

Usage : python poc_sensibilite_helene_berr.py
"""

import json
import os

import poc_bilan_horaire_helene_berr as pbh

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

U_MUR_ISOLE = round(1 / (1 / pbh.U_MUR + 2.449), 3)  # 0.202 W/m2.K
COUT_ISOLATION_ITI = "100 001-200 000 EUR HT (cote rue), 1,5% EP declare (estimation DPE 3.1.3)"
COUT_ISOLATION_ITE = "75 001-100 000 EUR HT (cote cour), 1,7% EP declare (estimation DPE 3.1.3)"
U_VITRAGE_MENUISERIES = 1.80  # DPE section 3.2.3, proposition d'intervention
COUT_MENUISERIES = "100 001-200 000 EUR HT, 2,6% EP declare (estimation DPE 3.2.3)"

SEGMENTS_UPGRADABLES_PROTECTION = (0, 17, 5)  # actuellement interieur -> peuvent passer exterieur
# N4 (2e passe d'audit) : mai et septembre restent des mois deficitaires
# (matins frais) ou un store mobile ne serait pas baisse par anticipation
# -- seulement juin-aout, pas mai-septembre.
MOIS_PROTECTION_ETE = (6, 7, 8)
G_EXTERIEUR_UPGRADE = 0.10


def classe(delta_pct):
    """delta_pct > 0 = amelioration (baisse du besoin/de l'apport indesirable).
    Un delta quasi nul est "sans effet", pas "defavorable"."""
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
    return round(baseline - variant, 1)


def g_baseline_avec_upgrade_saisonnier():
    """Part de la baseline deja saisonniere (pbh.g_baseline_par_segment,
    stores releves oct-avril) et ne change QUE juin-aout des segments
    upgradables (0,17,5), qui passent en exterieur (0,10) -- C13+N2+N4.
    Le reste de l'annee (y compris mai/septembre) reste identique a la
    baseline corrigee, pas de degradation artificielle."""
    g_par_segment = {idx: dict(v) for idx, v in pbh.g_baseline_par_segment().items()}
    for idx in SEGMENTS_UPGRADABLES_PROTECTION:
        for m in MOIS_PROTECTION_ETE:
            g_par_segment[idx][m] = G_EXTERIEUR_UPGRADE
    return g_par_segment


def resultat_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon, label):
    agg = pbh.calcule_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon)
    return {
        "scenario": label,
        "besoin_chauffage_kwh": pbh.besoin_chauffage_kwh(agg),
        "apport_ete_kwh": pbh.apport_ete_kwh(agg),
    }


def main():
    b = json.load(open(pbh.DATA_PATH, encoding="utf-8"))["batiment"]
    lat, lon, hauteur_m = b["latitude"], b["longitude"], b["hauteur_m"]
    segments = [s for s in b["facade_segments"] if not s["bruit"] and s.get("taux_vitrage_estime_pct") is not None]
    g_base = pbh.g_baseline_par_segment()
    g_protection_upgrade = g_baseline_avec_upgrade_saisonnier()

    print("=" * 70)
    print(f"POC Brique 5 -- Sensibilite unitaire -- {b['nom']} (id {b['id']}) -- corrige suite audit Fable")
    print(f"U_mur actuel = {pbh.U_MUR} -> isole {U_MUR_ISOLE} W/m2.K")
    print(f"Protection : segments {SEGMENTS_UPGRADABLES_PROTECTION} passent interieur(0,38)->exterieur(0,10), mai-sept. seulement")
    print(f"Menuiseries : U_vitrage -> {U_VITRAGE_MENUISERIES} W/m2.K")
    print("=" * 70)

    resultats = {"Isolation facade": [], "Protection solaire (upgrade saisonnier)": [], "Remplacement menuiseries": []}

    for label_u, u_vitrage in pbh.SCENARIOS_U_VITRAGE.items():
        base = resultat_scenario(segments, hauteur_m, u_vitrage, g_base, lat, lon, label_u)

        # --- Isolation facade ---
        u_mur_origine = pbh.U_MUR
        pbh.U_MUR = U_MUR_ISOLE
        iso = resultat_scenario(segments, hauteur_m, u_vitrage, g_base, lat, lon, label_u)
        pbh.U_MUR = u_mur_origine
        dk_c = delta_kwh(base["besoin_chauffage_kwh"], iso["besoin_chauffage_kwh"])
        dk_e = delta_kwh(base["apport_ete_kwh"], iso["apport_ete_kwh"])
        d_c = delta(base["besoin_chauffage_kwh"], iso["besoin_chauffage_kwh"])
        d_e = delta(base["apport_ete_kwh"], iso["apport_ete_kwh"])
        resultats["Isolation facade"].append({
            "scenario": label_u,
            "besoin_chauffage_baseline_kwh": base["besoin_chauffage_kwh"], "besoin_chauffage_variant_kwh": iso["besoin_chauffage_kwh"],
            "delta_hiver_kwh": dk_c, "delta_hiver_pct": d_c, "classe_hiver": classe(d_c),
            "apport_ete_baseline_kwh": base["apport_ete_kwh"], "apport_ete_variant_kwh": iso["apport_ete_kwh"],
            "delta_ete_kwh": dk_e, "delta_ete_pct": d_e, "classe_ete": classe(d_e),
        })
        print(f"\n[Isolation facade] {label_u}")
        print(f"  Besoin chauffage : {base['besoin_chauffage_kwh']} -> {iso['besoin_chauffage_kwh']} kWh ({dk_c:+.1f} kWh, {d_c:+.1f}%, {classe(d_c)})")
        print(f"  Apport ete (confort) : {base['apport_ete_kwh']} -> {iso['apport_ete_kwh']} kWh ({dk_e:+.1f} kWh, {d_e:+.1f}%, {classe(d_e)})")

        # --- Protection solaire (upgrade saisonnier) ---
        prot = resultat_scenario(segments, hauteur_m, u_vitrage, g_protection_upgrade, lat, lon, label_u)
        dk_c2 = delta_kwh(base["besoin_chauffage_kwh"], prot["besoin_chauffage_kwh"])
        dk_e2 = delta_kwh(base["apport_ete_kwh"], prot["apport_ete_kwh"])
        d_c2 = delta(base["besoin_chauffage_kwh"], prot["besoin_chauffage_kwh"])
        d_e2 = delta(base["apport_ete_kwh"], prot["apport_ete_kwh"])
        resultats["Protection solaire (upgrade saisonnier)"].append({
            "scenario": label_u,
            "besoin_chauffage_baseline_kwh": base["besoin_chauffage_kwh"], "besoin_chauffage_variant_kwh": prot["besoin_chauffage_kwh"],
            "delta_hiver_kwh": dk_c2, "delta_hiver_pct": d_c2, "classe_hiver": classe(d_c2),
            "apport_ete_baseline_kwh": base["apport_ete_kwh"], "apport_ete_variant_kwh": prot["apport_ete_kwh"],
            "delta_ete_kwh": dk_e2, "delta_ete_pct": d_e2, "classe_ete": classe(d_e2),
        })
        print(f"[Protection solaire upgrade] {label_u}")
        print(f"  Besoin chauffage : {base['besoin_chauffage_kwh']} -> {prot['besoin_chauffage_kwh']} kWh ({dk_c2:+.1f} kWh, {d_c2:+.1f}%, {classe(d_c2)})")
        print(f"  Apport ete (confort) : {base['apport_ete_kwh']} -> {prot['apport_ete_kwh']} kWh ({dk_e2:+.1f} kWh, {d_e2:+.1f}%, {classe(d_e2)})")

        # --- Remplacement menuiseries ---
        men = resultat_scenario(segments, hauteur_m, U_VITRAGE_MENUISERIES, g_base, lat, lon, label_u)
        dk_c3 = delta_kwh(base["besoin_chauffage_kwh"], men["besoin_chauffage_kwh"])
        d_c3 = delta(base["besoin_chauffage_kwh"], men["besoin_chauffage_kwh"])
        resultats["Remplacement menuiseries"].append({
            "scenario": label_u,
            "besoin_chauffage_baseline_kwh": base["besoin_chauffage_kwh"], "besoin_chauffage_variant_kwh": men["besoin_chauffage_kwh"],
            "delta_hiver_kwh": dk_c3, "delta_hiver_pct": d_c3, "classe_hiver": classe(d_c3),
        })
        print(f"[Remplacement menuiseries, U=1.80] {label_u}")
        print(f"  Besoin chauffage : {base['besoin_chauffage_kwh']} -> {men['besoin_chauffage_kwh']} kWh ({dk_c3:+.1f} kWh, {d_c3:+.1f}%, {classe(d_c3)})")

    print("\n" + "=" * 70)
    print("RESUME (aucune hypothese cachee) :")
    print(f"  - Isolation facade : {U_MUR_ISOLE} W/m2.K -- ITI {COUT_ISOLATION_ITI} ; ITE {COUT_ISOLATION_ITE}")
    print(f"  - Protection solaire : upgrade mai-septembre seulement sur segments {SEGMENTS_UPGRADABLES_PROTECTION} ; segments deja en exterieur (1,2,3) sans levier ici")
    print(f"  - Menuiseries : U={U_VITRAGE_MENUISERIES} -- {COUT_MENUISERIES}")
    print("  - apport_ete_kwh = indicateur de confort/surchauffe, PAS une economie d'energie (DPE 5.3 : pas de climatisation)")
    print("=" * 70)

    resultat = {
        "batiment_id": b["id"], "batiment_nom": b["nom"],
        "leviers": [
            {"nom": "Isolation facade", "u_mur_baseline": pbh.U_MUR, "u_mur_variant": U_MUR_ISOLE,
             "cout_iti": COUT_ISOLATION_ITI, "cout_ite": COUT_ISOLATION_ITE,
             "note_cout": "2 interventions distinctes au DPE, meme effet physique dans ce modele simplifie -- couts non fusionnes.",
             "confort": "non calculable avec ce modele", "scenarios": resultats["Isolation facade"]},
            {"nom": "Protection solaire (upgrade interieur->exterieur, saisonnier)", "g_ete": G_EXTERIEUR_UPGRADE,
             "mois_actifs": list(MOIS_PROTECTION_ETE), "segments_concernes": list(SEGMENTS_UPGRADABLES_PROTECTION),
             "cout_indicatif": "Non chiffre dans le DPE -- pas de valeur inventee.",
             "confort": "non calculable avec ce modele", "scenarios": resultats["Protection solaire (upgrade saisonnier)"]},
            {"nom": "Remplacement menuiseries", "u_vitrage_variant": U_VITRAGE_MENUISERIES,
             "cout_indicatif": COUT_MENUISERIES, "source": "DPE section 3.2.3",
             "confort": "non calculable avec ce modele", "scenarios": resultats["Remplacement menuiseries"]},
        ],
        "mise_en_garde": (
            "apport_ete_kwh est un indicateur de risque de surchauffe / confort, pas une economie d'energie "
            "(DPE section 5.3 : aucune climatisation existante, donc rien a economiser electriquement). "
            "Modele toujours limite a 2 flux + pertes plancher/toiture/ventilation ajoutees -- pas les apports "
            "internes ni le rendement reel du systeme de chauffage."
        ),
    }
    out_path = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "helene_berr_sensibilite_brique5.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(resultat, f, ensure_ascii=False, indent=2)
    print(f"\n[export json] {out_path}")


if __name__ == "__main__":
    main()
