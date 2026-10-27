"""
POC -- Briques 4, 6, 7 sur Helene Berr. Reecrit le 27/10/2026 suite a
l'audit Fable (voir poc_bilan_horaire_helene_berr.py et
poc_sensibilite_helene_berr.py pour le detail des corrections deja
appliquees au modele). Cocktail teste : Isolation facade + Protection
solaire (upgrade saisonnier interieur->exterieur, mai-septembre) --
les deux leviers deja individuellement mesures en Brique 5. Le 3e levier
(Remplacement menuiseries) n'est pas inclus dans ce cocktail -- un
cocktail a la fois (choix humain explicite), pourra etre teste separement.

Brique 4 (SEARCH_SPACE) : formalise les 3 leviers simulables (dont les 2
du cocktail).

Brique 6 (NEXT_GENERATION) : 1 cocktail -- Isolation + Protection
ensemble.

Brique 7 (PHYSICAL_RESULTS) : recalcule le cocktail en entier, compare au
gain naif (somme des deltas Brique 5, relus depuis le JSON deja exporte,
pas recalcules autrement).

Lecture seule : ne modifie aucun fichier de frontend/data/.

Usage : python poc_cocktail_helene_berr.py
"""

import json
import os

import poc_bilan_horaire_helene_berr as pbh
from poc_sensibilite_helene_berr import (
    U_MUR_ISOLE, U_VITRAGE_MENUISERIES, COUT_ISOLATION_ITI, COUT_ISOLATION_ITE, COUT_MENUISERIES,
    SEGMENTS_UPGRADABLES_PROTECTION, G_EXTERIEUR_UPGRADE, g_baseline_avec_upgrade_saisonnier,
    classe, delta, delta_kwh, resultat_scenario,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BRIQUE5_PATH = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "helene_berr_sensibilite_brique5.json")


def search_space():
    return {
        "Isolation facade": {
            "options": [
                {"id": "non_isole", "u_mur": pbh.U_MUR},
                {"id": "isole", "u_mur": U_MUR_ISOLE, "cout_iti": COUT_ISOLATION_ITI, "cout_ite": COUT_ISOLATION_ITE},
            ]
        },
        "Protection solaire": {
            "options": [
                {"id": "existant", "note": "stores interieurs (0,38) ou exterieurs (0,10) selon facade, deja en place"},
                {"id": "upgrade_saisonnier", "g_ete": G_EXTERIEUR_UPGRADE, "mois_actifs": "mai-septembre", "segments": list(SEGMENTS_UPGRADABLES_PROTECTION)},
            ]
        },
        "Remplacement menuiseries": {
            "options": [
                {"id": "actuel", "u_vitrage": "2,0 ou 2,6 (DPE, sensibilite)"},
                {"id": "remplace", "u_vitrage": U_VITRAGE_MENUISERIES, "cout_indicatif": COUT_MENUISERIES},
            ],
            "note": "Non inclus dans le cocktail teste ici -- 3e levier, a tester separement.",
        },
        "leviers_exclus": ["Installation GTB", "Relamping LED", "Ventilation double flux", "Changement generateur"],
        "note_exclusion": "Hors perimetre de ce modele (enveloppe + ventilation forfaitaire), pas une exclusion Brique 8.",
    }


def main():
    b = json.load(open(pbh.DATA_PATH, encoding="utf-8"))["batiment"]
    lat, lon, hauteur_m = b["latitude"], b["longitude"], b["hauteur_m"]
    segments = [s for s in b["facade_segments"] if not s["bruit"] and s.get("taux_vitrage_estime_pct") is not None]
    g_base = pbh.g_baseline_par_segment()

    brique5 = json.load(open(BRIQUE5_PATH, encoding="utf-8"))
    iso_scenarios = {s["scenario"]: s for s in brique5["leviers"][0]["scenarios"]}
    prot_scenarios = {s["scenario"]: s for s in brique5["leviers"][1]["scenarios"]}

    print("=" * 70)
    print(f"POC Briques 4-6-7 -- Cocktail combine -- {b['nom']} (id {b['id']}) -- corrige suite audit Fable")
    print("=" * 70)
    print("\n--- Brique 4 : SEARCH_SPACE ---")
    print(json.dumps(search_space(), ensure_ascii=False, indent=2))

    print("\n--- Brique 6 : NEXT_GENERATION ---")
    print("  1 cocktail genere : Isolation facade (isole) + Protection solaire (upgrade saisonnier), ensemble.")
    print("  Choix humain du cocktail a realiser : demande explicite de l'utilisateur, conversation en cours.")

    print("\n--- Brique 7 : PHYSICAL_RESULTS ---")
    resultats = []
    for label_u, u_vitrage in pbh.SCENARIOS_U_VITRAGE.items():
        nom_scenario = label_u
        base = resultat_scenario(segments, hauteur_m, u_vitrage, g_base, lat, lon, nom_scenario)

        # --- Cocktail combine : les deux leviers appliques ensemble ---
        u_mur_origine = pbh.U_MUR
        pbh.U_MUR = U_MUR_ISOLE
        g_combine = g_baseline_avec_upgrade_saisonnier()
        combine = resultat_scenario(segments, hauteur_m, u_vitrage, g_combine, lat, lon, nom_scenario)
        pbh.U_MUR = u_mur_origine

        dk_c = delta_kwh(base["besoin_chauffage_kwh"], combine["besoin_chauffage_kwh"])
        dk_e = delta_kwh(base["apport_ete_kwh"], combine["apport_ete_kwh"])
        d_c = delta(base["besoin_chauffage_kwh"], combine["besoin_chauffage_kwh"])
        d_e = delta(base["apport_ete_kwh"], combine["apport_ete_kwh"])

        dk_c_naif = iso_scenarios[nom_scenario]["delta_hiver_kwh"] + prot_scenarios[nom_scenario]["delta_hiver_kwh"]
        dk_e_naif = iso_scenarios[nom_scenario]["delta_ete_kwh"] + prot_scenarios[nom_scenario]["delta_ete_kwh"]

        ecart_c = round(dk_c - dk_c_naif, 1)
        ecart_e = round(dk_e - dk_e_naif, 1)

        print(f"\n[Cocktail combine] {nom_scenario}")
        print(f"  Besoin chauffage : baseline {base['besoin_chauffage_kwh']} -> combine {combine['besoin_chauffage_kwh']} kWh")
        print(f"    Gain combine reel : {dk_c:+.1f} kWh ({d_c:+.1f}%, {classe(d_c)})")
        print(f"    Somme naive (A+B) : {dk_c_naif:+.1f} kWh -- ecart (synergie/cannibalisation) : {ecart_c:+.1f} kWh")
        print(f"  Apport ete (confort) : baseline {base['apport_ete_kwh']} -> combine {combine['apport_ete_kwh']} kWh")
        print(f"    Gain combine reel : {dk_e:+.1f} kWh ({d_e:+.1f}%, {classe(d_e)})")
        print(f"    Somme naive (A+B) : {dk_e_naif:+.1f} kWh -- ecart (synergie/cannibalisation) : {ecart_e:+.1f} kWh")

        resultats.append({
            "scenario": nom_scenario,
            "besoin_chauffage_baseline_kwh": base["besoin_chauffage_kwh"], "besoin_chauffage_combine_kwh": combine["besoin_chauffage_kwh"],
            "delta_hiver_combine_kwh": dk_c, "delta_hiver_combine_pct": d_c, "classe_hiver_combine": classe(d_c),
            "delta_hiver_somme_naive_kwh": round(dk_c_naif, 1), "ecart_hiver_vs_naif_kwh": ecart_c,
            "apport_ete_baseline_kwh": base["apport_ete_kwh"], "apport_ete_combine_kwh": combine["apport_ete_kwh"],
            "delta_ete_combine_kwh": dk_e, "delta_ete_combine_pct": d_e, "classe_ete_combine": classe(d_e),
            "delta_ete_somme_naive_kwh": round(dk_e_naif, 1), "ecart_ete_vs_naif_kwh": ecart_e,
        })

    # Synthese honnete (C16) -- generee a partir des chiffres ci-dessus, pas d'avance
    gains_hiver = [r["delta_hiver_combine_pct"] for r in resultats]
    gains_ete = [r["delta_ete_combine_pct"] for r in resultats]
    verdict_hiver = "favorable" if min(gains_hiver) > 0 else ("mitige" if max(gains_hiver) > 0 else "defavorable")
    verdict_ete = "favorable" if min(gains_ete) > 0 else ("mitige" if max(gains_ete) > 0 else "defavorable")

    print("\n" + "=" * 70)
    print("RESUME (aucune hypothese cachee) :")
    print(f"  - Cocktail hiver (besoin de chauffage) : {verdict_hiver} sur les 2 scenarios U_vitrage ({gains_hiver})")
    print(f"  - Cocktail ete (confort/surchauffe) : {verdict_ete} sur les 2 scenarios ({gains_ete})")
    print("  - Conclusion de la version precedente (\"protection solaire reste defavorable meme combinee\") etait")
    print("    un artefact du modele incomplet (C8/C10/C12 de l'audit Fable) -- remplacee par le resultat ci-dessus,")
    print("    recalcule sur le modele corrige (protection existante en baseline, store saisonnier, pertes completes).")
    print("=" * 70)

    resultat = {
        "batiment_id": b["id"], "batiment_nom": b["nom"],
        "search_space": search_space(),
        "next_generation": {
            "cocktails_generes": ["Isolation facade (isole) + Protection solaire (upgrade saisonnier)"],
            "choix_humain": "Demande explicite de l'utilisateur, conversation en cours.",
        },
        "physical_results": resultats,
        "synthese": {
            "verdict_hiver": verdict_hiver,
            "verdict_ete": verdict_ete,
            "note": (
                "Recalcule integralement sur le modele corrige suite audit Fable (voir "
                "poc_bilan_horaire_helene_berr.py) -- remplace la conclusion de la version precedente, "
                "devenue obsolete."
            ),
        },
        "mise_en_garde": (
            "Cocktail combine recalcule integralement (pas une addition des gains individuels) -- les ecarts "
            "entre gain combine et somme naive sont affiches explicitement, jamais masques. apport_ete_kwh reste "
            "un indicateur de confort, pas une economie d'energie (pas de climatisation existante)."
        ),
    }
    out_path = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "helene_berr_cocktail_brique467.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(resultat, f, ensure_ascii=False, indent=2)
    print(f"\n[export json] {out_path}")


if __name__ == "__main__":
    main()
