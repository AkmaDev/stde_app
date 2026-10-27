"""
POC -- bilan thermique horaire (transmission + solaire) sur un bâtiment reel,
suite directe de sdte_jean/Methode calcul apport solaire.pdf, section 25-26.
Copie adaptee de poc_bilan_horaire.py (Jean-Pierre Melville) pour le 2e
batiment le mieux documente du parc.

Batiment : Helene Berr (id 9) -- 8 segments de facade reels avec taux de
vitrage estime, geometrie APUR verifiee, irradiance deja corrigee des
masques solaires en cache.

Regle absolue (voir memoire feedback_jamais_de_donnee_inventee) : aucune
valeur sans source n'est choisie arbitrairement.

  - U_vitrage : le DPE d'Helene Berr (section 3.2.1) donne deux valeurs sans
    dire laquelle s'applique a quelle facade ("Double vitrage sur menuiserie
    PVC, 2,0 W/m2.K" et "Double vitrage sur menuiserie PVC, 2,6 W/m2.K") --
    meme ambiguite que JPM, traitee en SENSIBILITE (2 scenarios cote a cote).

  - g (facteur solaire) : contrairement a JPM, pas de vraie ambiguite de type
    de vitrage ici -- le DPE confirme du double vitrage dans les 2 valeurs
    U ci-dessus (pas de simple vitrage). Une seule valeur documentee :
    g=0.75 (double vitrage clair, meme reference catalogue que celle deja
    utilisee pour JPM) -- pas de sensibilite artificielle sans ambiguite
    reelle a documenter.

U_mur = 0,40 W/m2.K : seule valeur du DPE Helene Berr (section 3.1.1,
"Batiment 1", mur beton isole), utilisee pour tout le batiment comme
simplification explicitement documentee ici -- pas une donnee mesuree
batiment entier.

T_int = 20 degC : consigne conventionnelle non mesuree, meme convention que
JPM.

Lecture seule : ne modifie aucun fichier de frontend/data/batiment/. Rapport
texte + export JSON uniquement -- ce n'est pas encore une donnee destinee a
l'interface.

Usage : python poc_bilan_horaire_helene_berr.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recompute_conso_mesuree import moyenne_mensuelle_reelle

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "batiment", "9.json")
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

U_MUR = 0.40  # W/m2.K -- DPE Helene Berr section 3.1.1, "Batiment 1" (seule valeur disponible)
T_INT = 20.0  # degC -- consigne conventionnelle, non mesuree (hypothese documentee)

# Scenarios U_vitrage : les deux valeurs reelles du DPE Helene Berr (section 3.2.1),
# aucune preference -- affichees cote a cote.
SCENARIOS_U_VITRAGE = {
    "double_vitrage_pvc (DPE, 2.0)": 2.0,
    "double_vitrage_pvc (DPE, 2.6)": 2.6,
}

# g (facteur solaire) : une seule valeur documentee -- contrairement a JPM, le
# DPE ne laisse pas planer d'ambiguite simple/double vitrage ici (les 2 valeurs
# U ci-dessus sont deja toutes les deux "double vitrage PVC").
G = 0.75  # double vitrage clair, reference catalogue (meme valeur que JPM)

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


def calcule_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon):
    agg = {m: {"transmission_kwh": 0.0, "solaire_kwh": 0.0, "solde_kwh": 0.0} for m in range(1, 13)}
    for seg in segments:
        mois_seg = calcule_bilan_facade(seg, hauteur_m, u_vitrage, g_eff, lat, lon)
        additionne(agg, mois_seg)
    return agg


def exporte_json(b, segments, hauteur_m, lat, lon, out_path, profil_reel, annees_reel):
    """Ecrit les memes resultats que le rapport texte (aucun chiffre different).
    Toujours les 4 scenarios cote a cote -- jamais un seul choisi comme "la"
    reponse (meme principe que poc_bilan_horaire.py)."""
    scenarios = []
    for label_u, u_vitrage in SCENARIOS_U_VITRAGE.items():
        for protection in (False, True):
            g_eff = G * F_PROTECTION_STORE_EXT if protection else G
            nom_scenario = f"{label_u} x g={G}" + (" + store exterieur" if protection else "")
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
                    "g": G,
                    "g_label": "0.75 (double vitrage clair, reference catalogue)",
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
            "u_mur": {"valeur": U_MUR, "unite": "W/m2.K", "note": "DPE Helene Berr, section 3.1.1, 'Batiment 1', etendu a tout le batiment"},
            "t_int": {"valeur": T_INT, "unite": "degC", "note": "convention non mesuree"},
            "u_vitrage_scenarios": list(SCENARIOS_U_VITRAGE.values()),
            "g": {"valeur": G, "note": "double vitrage clair, reference catalogue -- pas d'ambiguite de type a cette fois (contrairement a JPM)"},
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
    print(f"U_mur = {U_MUR} W/m2.K (DPE, 'Batiment 1', hypothese : applique a tout le batiment)")
    print(f"T_int = {T_INT} degC (consigne conventionnelle, non mesuree)")
    print(f"g = {G} (double vitrage clair, reference catalogue -- pas d'ambiguite de type ici)")
    print("=" * 70)

    for label_u, u_vitrage in SCENARIOS_U_VITRAGE.items():
        for protection in (False, True):
            g_eff = G * F_PROTECTION_STORE_EXT if protection else G
            nom_scenario = f"{label_u} x g={G}" + (" + store exterieur" if protection else "")
            agg = calcule_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon)
            imprime_tableau(nom_scenario, agg, profil_reel, annees_reel)

    print("\n" + "=" * 70)
    print("RESUME DES HYPOTHESES (aucune n'est cachee) :")
    print(f"  - U_mur = {U_MUR} W/m2.K : DPE Helene Berr, section 3.1.1, 'Batiment 1', etendu a tout le batiment")
    print(f"  - U_vitrage : 2 valeurs DPE testees, pas de choix arbitraire ({list(SCENARIOS_U_VITRAGE.values())})")
    print(f"  - g = {G} : double vitrage clair, reference catalogue -- pas d'ambiguite de type (contrairement a JPM)")
    print(f"  - T_int = {T_INT} degC : convention non mesuree")
    print(f"  - F_protection (store ext.) = {F_PROTECTION_STORE_EXT} : reference ES-SO/ACTIBAIE (EN14501)")
    print("  - Etape 11 (comparaison Cerema) : NON FAITE -- pas d'acces a l'outil, blocage reel")
    if profil_reel:
        print(f"  - Comparaison conso reelle ({', '.join(annees_reel)}) : {NOTE_COMPARAISON}")
    else:
        print("  - Comparaison conso reelle : impossible (pas d'annee calendaire complete dans les factures)")
    print("=" * 70)

    out_path = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "helene_berr_resultat_brique3.json")
    exporte_json(b, segments, hauteur_m, lat, lon, out_path, profil_reel, annees_reel)


if __name__ == "__main__":
    main()
