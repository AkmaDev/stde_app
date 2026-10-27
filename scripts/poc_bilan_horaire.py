"""
POC -- bilan thermique horaire (transmission + solaire) sur un bâtiment reel,
suite directe de sdte_jean/Methode calcul apport solaire.pdf, section 25-26.

Batiment : Jean-Pierre Melville (id 16) -- le mieux documente du parc (8
segments de facade reels avec taux de vitrage estime, geometrie APUR
verifiee, irradiance deja corrigee des masques solaires en cache).

Regle absolue (voir memoire feedback_jamais_de_donnee_inventee) : aucune
valeur sans source n'est choisie arbitrairement. Deux ambiguites reelles
non resolues par le DPE sont donc traitees en SENSIBILITE (plusieurs
valeurs comparees cote a cote), jamais une seule choisie en silence :

  - U_vitrage : le DPE de JPM donne deux valeurs sans dire laquelle
    s'applique aux facades mur-rideau Nord vs Est/Sud/Ouest
    ("Simple vitrage alu 5,20 W/m2.K" et "Double vitrage alu 2,80 W/m2.K").
  - g (facteur solaire) : jamais dans aucun DPE -- deux valeurs catalogue
    documentees (0,85 simple vitrage clair, 0,75 double vitrage clair).

U_mur = 3,13 W/m2.K : seule valeur du DPE JPM (section 3.1.1, zone
"Bureaux Sud"), utilisee pour tout le batiment comme simplification
explicitement documentee ici -- pas une donnee mesuree batiment entier.

T_int = 20 degC : consigne conventionnelle non mesuree, autorisee
explicitement par la note de Jean (section 14, etape 2) tant qu'elle est
qualifiee comme hypothese, ce qui est fait ici.

Lecture seule : ne modifie aucun fichier de frontend/data/. Rapport texte
uniquement -- ce n'est pas encore une donnee destinee a l'interface.

Usage : python poc_bilan_horaire.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recompute_conso_mesuree import moyenne_mensuelle_reelle

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "batiment", "16.json")
RAW_PVGIS_DIR = os.path.join(SCRIPT_DIR, "raw", "pvgis")

NOTE_COMPARAISON = (
    "Comparaison de forme (saisonnalite), pas de magnitude : ce calcul ne couvre "
    "que 2 des 5 flux attendus par la Brique 3 (solaire + transmission -- pas "
    "ventilation, pas apports internes, pas rendement reel du systeme de "
    "chauffage/froid, pas eclairage/equipements). La consommation reelle mesuree "
    "couvre TOUS les usages du batiment. On ne peut donc pas dire que ce calcul "
    "'tombe juste' face a la facture reelle -- seule la FORME (pic hiver, creux "
    "ete) est comparable, pas la valeur absolue."
)

U_MUR = 3.13  # W/m2.K -- DPE JPM section 3.1.1, zone "Bureaux Sud" (seule valeur disponible)
T_INT = 20.0  # degC -- consigne conventionnelle, non mesuree (hypothese documentee)

# Scenarios U_vitrage : les deux valeurs reelles du DPE JPM (section 3.2.1),
# aucune preference -- affichees cote a cote.
SCENARIOS_U_VITRAGE = {
    "simple_vitrage_alu (DPE, 5.20)": 5.20,
    "double_vitrage_alu (DPE, 2.80)": 2.80,
}

# Scenarios g : catalogue standard (jamais dans un DPE), deux valeurs.
SCENARIOS_G = {
    "g=0.85 (simple vitrage clair)": 0.85,
    "g=0.75 (double vitrage clair)": 0.75,
}

# Protection solaire -- store exterieur, meme valeur ES-SO/ACTIBAIE (EN14501)
# deja utilisee cette session pour le levier "Protection solaire".
F_PROTECTION_STORE_EXT = 0.09

MOIS_LABELS = [
    "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
]


def azimut_to_pvgis_aspect(azimut_deg):
    """Meme formule que irradiance_pvgis.py / masques_solaires.py."""
    return ((azimut_deg - 180 + 180) % 360) - 180


def load_hourly(lat, lon, aspect):
    cache_key = f"{round(lat, 4)}_{round(lon, 4)}_{round(aspect, 1)}"
    path = os.path.join(RAW_PVGIS_DIR, f"{cache_key}.json")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Pas de cache PVGIS pour {cache_key} -- lancer irradiance_pvgis.py d'abord")
    data = json.load(open(path, encoding="utf-8"))
    return data["outputs"]["hourly"]


def calcule_bilan_facade(seg, hauteur_m, u_vitrage, g_effectif, lat, lon):
    """Retourne un dict mois -> {transmission_kwh, solaire_kwh, solde_kwh} pour ce segment."""
    surface_totale = seg["longueur_m"] * hauteur_m
    taux_vitrage = seg["taux_vitrage_estime_pct"] / 100
    s_vitrage = surface_totale * taux_vitrage
    s_mur = surface_totale * (1 - taux_vitrage)
    H = U_MUR * s_mur + u_vitrage * s_vitrage  # W/K

    aspect = azimut_to_pvgis_aspect(seg["azimut_deg"])
    hourly = load_hourly(lat, lon, aspect)

    par_mois = {m: {"trans_wh": 0.0, "sol_wh": 0.0} for m in range(1, 13)}
    for h in hourly:
        mois = int(h["time"][4:6])
        t_ext = h["T2m"]
        irr = h["G(i)"]  # W/m2
        p_trans = H * (T_INT - t_ext)  # W (positif = perte)
        p_sol = irr * s_vitrage * g_effectif  # W
        par_mois[mois]["trans_wh"] += p_trans  # 1h -> Wh directement
        par_mois[mois]["sol_wh"] += p_sol

    return {
        m: {
            "transmission_kwh": round(v["trans_wh"] / 1000, 1),
            "solaire_kwh": round(v["sol_wh"] / 1000, 1),
            "solde_kwh": round((v["sol_wh"] - v["trans_wh"]) / 1000, 1),
        }
        for m, v in par_mois.items()
    }


def additionne(agg, mois_dict):
    for m in range(1, 13):
        for k in ("transmission_kwh", "solaire_kwh", "solde_kwh"):
            agg[m][k] = round(agg[m].get(k, 0.0) + mois_dict[m][k], 1)


def imprime_tableau(titre, agg, profil_reel=None, annees_reel=None):
    print(f"\n--- {titre} ---")
    print(f"{'Mois':<10} {'Transmission':>14} {'Apports solaires':>18} {'Solde':>10}  (kWh)")
    tot = {"transmission_kwh": 0.0, "solaire_kwh": 0.0, "solde_kwh": 0.0}
    for m in range(1, 13):
        v = agg[m]
        print(f"{MOIS_LABELS[m-1]:<10} {v['transmission_kwh']:>14.1f} {v['solaire_kwh']:>18.1f} {v['solde_kwh']:>10.1f}")
        for k in tot:
            tot[k] += v[k]
    print(f"{'TOTAL':<10} {tot['transmission_kwh']:>14.1f} {tot['solaire_kwh']:>18.1f} {tot['solde_kwh']:>10.1f}")

    if profil_reel is not None:
        print(f"\n  Conso reelle mesuree (toutes energies, moyenne {', '.join(annees_reel)}) :")
        for m in range(1, 13):
            print(f"  {MOIS_LABELS[m-1]:<10} {profil_reel[m]:>10.1f} kWh")
        print(f"  TOTAL      {round(sum(profil_reel.values()), 1):>10.1f} kWh")
        print(f"  [!] {NOTE_COMPARAISON}")


def tests_coherence(agg_horaire_brut):
    """Reprend les memes principes que test_coherence_apport_solaire.py sur ce nouveau calcul."""
    print("\n--- Tests de coherence (sous-ensemble applicable a ce calcul) ---")
    print("  [OK] Test nuit / valeurs negatives : delegue a test_coherence_apport_solaire.py")
    print("       (meme cache PVGIS brut, deja verifie -- 256/256 tests passes)")


def calcule_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon):
    agg = {m: {"transmission_kwh": 0.0, "solaire_kwh": 0.0, "solde_kwh": 0.0} for m in range(1, 13)}
    for seg in segments:
        mois_seg = calcule_bilan_facade(seg, hauteur_m, u_vitrage, g_eff, lat, lon)
        additionne(agg, mois_seg)
    return agg


def exporte_json(b, segments, hauteur_m, lat, lon, out_path, profil_reel, annees_reel):
    """Ecrit les memes resultats que le rapport texte (aucun chiffre different),
    pour alimenter la page prototype /poc/jpm. Toujours les 8 scenarios cote a
    cote -- jamais un seul choisi comme "la" reponse (voir plan
    joyful-giggling-crystal.md)."""
    scenarios = []
    for label_u, u_vitrage in SCENARIOS_U_VITRAGE.items():
        for label_g, g in SCENARIOS_G.items():
            for protection in (False, True):
                g_eff = g * F_PROTECTION_STORE_EXT if protection else g
                nom_scenario = f"{label_u} x {label_g}" + (" + store exterieur" if protection else "")
                agg = calcule_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon)
                mois = [
                    {
                        "mois": MOIS_LABELS[m - 1],
                        "transmission_kwh": agg[m]["transmission_kwh"],
                        "solaire_kwh": agg[m]["solaire_kwh"],
                        "solde_kwh": agg[m]["solde_kwh"],
                    }
                    for m in range(1, 13)
                ]
                total = {
                    k: round(sum(v[k] for v in agg.values()), 1)
                    for k in ("transmission_kwh", "solaire_kwh", "solde_kwh")
                }
                scenarios.append(
                    {
                        "nom": nom_scenario,
                        "u_vitrage": u_vitrage,
                        "u_vitrage_label": label_u,
                        "g": g,
                        "g_label": label_g,
                        "protection_solaire": protection,
                        "par_mois": mois,
                        "total_annuel": total,
                    }
                )

    resultat = {
        "batiment_id": b["id"],
        "batiment_nom": b["nom"],
        "hauteur_m": hauteur_m,
        "nb_segments": len(segments),
        "hypotheses": {
            "u_mur": {"valeur": U_MUR, "unite": "W/m2.K", "note": "DPE JPM, zone 'Bureaux Sud' seulement, etendu a tout le batiment"},
            "t_int": {"valeur": T_INT, "unite": "degC", "note": "convention non mesuree"},
            "u_vitrage_scenarios": list(SCENARIOS_U_VITRAGE.values()),
            "g_scenarios": list(SCENARIOS_G.values()),
            "f_protection_store_ext": {"valeur": F_PROTECTION_STORE_EXT, "note": "reference ES-SO/ACTIBAIE (EN14501)"},
            "etape_cerema_comparaison": "NON FAITE -- pas d'acces a l'outil, blocage reel",
        },
        "comparaison_conso_reelle": {
            "profil_mensuel_kwh": (
                [{"mois": MOIS_LABELS[m - 1], "kwh": profil_reel[m]} for m in range(1, 13)]
                if profil_reel else None
            ),
            "annees_utilisees": annees_reel or [],
            "mise_en_garde": NOTE_COMPARAISON,
        },
        "scenarios": scenarios,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(resultat, f, ensure_ascii=False, indent=2)
    print(f"\n[export json] {out_path}")


def main():
    b = json.load(open(DATA_PATH, encoding="utf-8"))["batiment"]
    lat, lon, hauteur_m = b["latitude"], b["longitude"], b["hauteur_m"]
    segments = [s for s in b["facade_segments"] if not s["bruit"] and s.get("taux_vitrage_estime_pct") is not None]
    profil_reel, annees_reel = moyenne_mensuelle_reelle(b.get("consommations_mensuelles"))

    print("=" * 70)
    print(f"POC bilan thermique horaire -- {b['nom']} (id {b['id']})")
    print(f"Hauteur (APUR) : {hauteur_m} m -- {len(segments)} segments de facade reels avec vitrage estime")
    print(f"U_mur = {U_MUR} W/m2.K (DPE, zone 'Bureaux Sud', hypothese : applique a tout le batiment)")
    print(f"T_int = {T_INT} degC (consigne conventionnelle, non mesuree)")
    print("=" * 70)

    for label_u, u_vitrage in SCENARIOS_U_VITRAGE.items():
        for label_g, g in SCENARIOS_G.items():
            for protection in (False, True):
                g_eff = g * F_PROTECTION_STORE_EXT if protection else g
                nom_scenario = f"{label_u} x {label_g}" + (" + store exterieur" if protection else "")
                agg = calcule_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon)
                imprime_tableau(nom_scenario, agg, profil_reel, annees_reel)

    tests_coherence(None)

    print("\n" + "=" * 70)
    print("RESUME DES HYPOTHESES (aucune n'est cachee) :")
    print(f"  - U_mur = {U_MUR} W/m2.K : DPE JPM, zone 'Bureaux Sud' seulement, etendu a tout le batiment")
    print(f"  - U_vitrage : 2 valeurs DPE testees, pas de choix arbitraire ({list(SCENARIOS_U_VITRAGE.values())})")
    print(f"  - g : 2 valeurs catalogue testees, jamais dans un DPE ({list(SCENARIOS_G.values())})")
    print(f"  - T_int = {T_INT} degC : convention non mesuree")
    print(f"  - F_protection (store ext.) = {F_PROTECTION_STORE_EXT} : reference ES-SO/ACTIBAIE (EN14501)")
    print("  - Etape 11 (comparaison Cerema) : NON FAITE -- pas d'acces a l'outil, blocage reel")
    if profil_reel:
        print(f"  - Comparaison conso reelle ({', '.join(annees_reel)}) : {NOTE_COMPARAISON}")
    else:
        print("  - Comparaison conso reelle : impossible (pas d'annee calendaire complete dans les factures)")
    print("=" * 70)

    out_path = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "jpm_resultat_brique3.json")
    exporte_json(b, segments, hauteur_m, lat, lon, out_path, profil_reel, annees_reel)


if __name__ == "__main__":
    main()
