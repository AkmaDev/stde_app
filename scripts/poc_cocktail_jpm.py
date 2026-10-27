"""
POC -- Briques 4, 6, 7 (Catalogue, Generateur de cocktails, Recalcul physique
complet) sur Jean-Pierre Melville, suite directe de poc_sensibilite_jpm.py
(Brique 5, deja fermee).

Brique 4 (SEARCH_SPACE) : formalise l'espace de recherche deja connu depuis
la Brique 5 -- pas de nouvelle donnee, juste sa mise en forme explicite.
Seuls 2 des 6 leviers du catalogue (frontend/data/leviers.json) y figurent,
les 4 autres (GTB, Relamping LED, Ventilation double flux, Changement
generateur) restant hors du perimetre de notre modele (enveloppe seule).

Brique 6 (NEXT_GENERATION) : un seul cocktail nouveau -- Isolation facade +
Protection solaire ENSEMBLE, jamais teste jusqu'ici (Brique 5 ne teste
qu'un levier a la fois). Les 3 autres combinaisons (aucun levier, isolation
seule, protection seule) sont deja dans poc_sensibilite_jpm.py, pas refaites
ici. "Choix humain du cocktail a realiser" (exige par la brique) = demande
explicite de l'utilisateur.

Brique 7 (PHYSICAL_RESULTS) : recalcule le cocktail combine en entier (une
seule fonction calcule_scenario, les deux parametres changes ensemble) et
verifie le controle propre a cette brique : Gain(A+B) vs Gain(A)+Gain(B) --
pas d'additivite supposee, l'ecart (synergie ou cannibalisation) est affiche
explicitement, jamais fusionne silencieusement dans un chiffre unique.

Lecture seule : ne modifie aucun fichier de frontend/data/. Relit le JSON
Brique 5 deja exporte (jpm_sensibilite_brique5.json) pour la somme naive,
ne le recalcule pas autrement.

Usage : python poc_cocktail_jpm.py
"""

import json
import os

import poc_bilan_horaire as pbh
from poc_sensibilite_jpm import U_MUR_ISOLE, besoin_chauffage_kwh, apport_ete_kwh, classe, delta, delta_kwh

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BRIQUE5_PATH = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "jpm_sensibilite_brique5.json")


def search_space():
    return {
        "Isolation facade": {
            "options": [
                {"id": "non_isole", "u_mur": pbh.U_MUR},
                {"id": "isole", "u_mur": U_MUR_ISOLE, "source": "DPE JPM section 3.1.3 (fibre de bois 12cm)"},
            ]
        },
        "Protection solaire": {
            "options": [
                {"id": "sans_protection", "facteur_g": 1.0},
                {"id": "store_exterieur", "facteur_g": pbh.F_PROTECTION_STORE_EXT, "source": "ES-SO/ACTIBAIE (EN14501)"},
            ]
        },
        "leviers_exclus": [
            "Installation GTB", "Relamping LED", "Ventilation double flux", "Changement generateur",
        ],
        "note_exclusion": (
            "Hors perimetre de ce modele (enveloppe seule -- transmission + solaire), "
            "pas une exclusion physique (Brique 8), une limite de modele."
        ),
    }


def main():
    b = json.load(open(pbh.DATA_PATH, encoding="utf-8"))["batiment"]
    lat, lon, hauteur_m = b["latitude"], b["longitude"], b["hauteur_m"]
    segments = [s for s in b["facade_segments"] if not s["bruit"] and s.get("taux_vitrage_estime_pct") is not None]

    brique5 = json.load(open(BRIQUE5_PATH, encoding="utf-8"))
    iso_scenarios = {s["scenario"]: s for s in brique5["leviers"][0]["scenarios"]}
    prot_scenarios = {s["scenario"]: s for s in brique5["leviers"][1]["scenarios"]}

    print("=" * 70)
    print(f"POC Briques 4-6-7 -- Cocktail combine -- {b['nom']} (id {b['id']})")
    print("=" * 70)
    print("\n--- Brique 4 : SEARCH_SPACE ---")
    print(json.dumps(search_space(), ensure_ascii=False, indent=2))

    print("\n--- Brique 6 : NEXT_GENERATION ---")
    print("  1 cocktail genere : Isolation facade (isole) + Protection solaire (store exterieur), ensemble.")
    print("  Choix humain du cocktail a realiser : demande explicite de l'utilisateur dans la conversation.")

    print("\n--- Brique 7 : PHYSICAL_RESULTS ---")
    resultats = []
    for label_u, u_vitrage in pbh.SCENARIOS_U_VITRAGE.items():
        for label_g, g in pbh.SCENARIOS_G.items():
            nom_scenario = f"{label_u} x {label_g}"

            agg_baseline = pbh.calcule_scenario(segments, hauteur_m, u_vitrage, g, lat, lon)
            base_chauffage = besoin_chauffage_kwh(agg_baseline)
            base_ete = apport_ete_kwh(agg_baseline)

            # --- Cocktail combine : les deux leviers appliques ensemble ---
            u_mur_origine = pbh.U_MUR
            pbh.U_MUR = U_MUR_ISOLE
            g_eff_combine = g * pbh.F_PROTECTION_STORE_EXT
            agg_combine = pbh.calcule_scenario(segments, hauteur_m, u_vitrage, g_eff_combine, lat, lon)
            pbh.U_MUR = u_mur_origine

            combine_chauffage = besoin_chauffage_kwh(agg_combine)
            combine_ete = apport_ete_kwh(agg_combine)
            dk_chauffage_combine = delta_kwh(base_chauffage, combine_chauffage)
            dk_ete_combine = delta_kwh(base_ete, combine_ete)
            d_chauffage_combine = delta(base_chauffage, combine_chauffage)
            d_ete_combine = delta(base_ete, combine_ete)

            # --- Somme naive (Brique 5, relue, pas recalculee) ---
            dk_chauffage_naif = (
                iso_scenarios[nom_scenario]["delta_hiver_kwh"] + prot_scenarios[nom_scenario]["delta_hiver_kwh"]
            )
            dk_ete_naif = (
                iso_scenarios[nom_scenario]["delta_ete_kwh"] + prot_scenarios[nom_scenario]["delta_ete_kwh"]
            )

            ecart_chauffage = round(dk_chauffage_combine - dk_chauffage_naif, 1)
            ecart_ete = round(dk_ete_combine - dk_ete_naif, 1)

            print(f"\n[Cocktail combine] {nom_scenario}")
            print(f"  Besoin chauffage : baseline {base_chauffage} -> combine {combine_chauffage} kWh")
            print(f"    Gain combine reel : {dk_chauffage_combine:+.1f} kWh ({d_chauffage_combine:+.1f}%, {classe(d_chauffage_combine)})")
            print(f"    Somme naive (A+B) : {dk_chauffage_naif:+.1f} kWh")
            print(f"    Ecart (synergie si positif, cannibalisation si negatif) : {ecart_chauffage:+.1f} kWh")
            print(f"  Apport ete       : baseline {base_ete} -> combine {combine_ete} kWh")
            print(f"    Gain combine reel : {dk_ete_combine:+.1f} kWh ({d_ete_combine:+.1f}%, {classe(d_ete_combine)})")
            print(f"    Somme naive (A+B) : {dk_ete_naif:+.1f} kWh")
            print(f"    Ecart (synergie si positif, cannibalisation si negatif) : {ecart_ete:+.1f} kWh")

            resultats.append(
                {
                    "scenario": nom_scenario,
                    "besoin_chauffage_baseline_kwh": base_chauffage,
                    "besoin_chauffage_combine_kwh": combine_chauffage,
                    "delta_hiver_combine_kwh": dk_chauffage_combine,
                    "delta_hiver_combine_pct": d_chauffage_combine,
                    "classe_hiver_combine": classe(d_chauffage_combine),
                    "delta_hiver_somme_naive_kwh": round(dk_chauffage_naif, 1),
                    "ecart_hiver_vs_naif_kwh": ecart_chauffage,
                    "apport_ete_baseline_kwh": base_ete,
                    "apport_ete_combine_kwh": combine_ete,
                    "delta_ete_combine_kwh": dk_ete_combine,
                    "delta_ete_combine_pct": d_ete_combine,
                    "classe_ete_combine": classe(d_ete_combine),
                    "delta_ete_somme_naive_kwh": round(dk_ete_naif, 1),
                    "ecart_ete_vs_naif_kwh": ecart_ete,
                }
            )

    print("\n" + "=" * 70)
    print("RESUME (aucune hypothese cachee) :")
    print("  - Gain(A+B) compare a Gain(A)+Gain(B) pour chaque scenario, pas d'additivite supposee.")
    print("  - Confort : non calculable avec ce modele.")
    print("  - Cout combine : non calcule (les 2 couts DPE ne s'additionnent pas forcement, hors scope).")
    print("=" * 70)

    resultat = {
        "batiment_id": b["id"],
        "batiment_nom": b["nom"],
        "search_space": search_space(),
        "next_generation": {
            "cocktails_generes": ["Isolation facade (isole) + Protection solaire (store exterieur)"],
            "choix_humain": "Demande explicite de l'utilisateur, conversation en cours.",
        },
        "physical_results": resultats,
        "mise_en_garde": (
            "Cocktail combine recalcule integralement (pas une addition des gains individuels) -- "
            "les ecarts entre gain combine et somme naive sont affiches explicitement, jamais masques."
        ),
    }
    out_path = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "jpm_cocktail_brique467.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(resultat, f, ensure_ascii=False, indent=2)
    print(f"\n[export json] {out_path}")


if __name__ == "__main__":
    main()
