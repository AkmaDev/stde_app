"""
POC -- bilan thermique horaire (transmission + solaire) sur Helene Berr.
Reecrit le 27/10/2026 suite a l'audit independant de Fable 5.1 (plans reels,
DPE, photos, article confrontes au modele -- voir conversation). Corrections
appliquees ici (numeros = constats de l'audit) :

  C8 -- Le batiment a DEJA des protections solaires (planches DPA 2010) :
    stores toiles EXTERIEURS sur les facades lues sur COUPE-FACADE SUD/EST
    (segments 1, 2, 3 -- Gtot~0,10, ES-SO/ACTIBAIE) et stores toiles
    INTERIEURS sur FACADE PICPUS/REUILLY (segments 0, 17, 5 -- Gtot~0,38,
    meme reference deja utilisee dans data/levier/2.json pour ce batiment).
    L'ancien g=0,75 uniforme ("verre seul, sans aucune protection") n'etait
    PAS l'etat reel du batiment -- remplace par un g_eff par segment
    reflettant l'etat existant. g=0,75x0,75x0,9=0,50 (cadre+salissure,
    toujours sans aucune donnee de store) reste la valeur pour les segments
    sans donnee de protection (4, 18).

  C10 -- Pertes plancher bas (U=2,3 W/m2.K, DPE 3.3) et toiture-terrasse
    (U=0,6 W/m2.K, DPE 3.4) absentes du calcul precedent. Surface non
    donnee par le DPE -- utilise l'emprise reelle APUR (scripts/
    manual_selection.json["9"]["apur_rings"], aire par la formule du lacet)
    = 400 m2, approximation documentee (emprise au sol ~ aire plancher/
    toiture, pas une mesure DPE directe).

  C12 -- Pertes ventilation absentes. H_ventilation ~= 1200 W/K repris tel
    quel de l'estimation de l'audit Fable (0,34 x 0,6 vol/h x 5900 m3, DPE
    §4.6 VMC simple flux + §3.2.3 grilles d'entree d'air) -- pas re-derive
    independamment pour eviter une divergence entre deux estimations non
    reconciliees.

  C3 -- Hauteur differenciee par facade (bloc 21,45 m / aile 15,64 m /
    segment 5 en moyenne ponderee 17,34 m), lue depuis facade_segments[i].
    hauteur_segment_m (ajoute aux donnees du batiment), plus la meme
    hauteur generale (23 m) en repli pour tout segment sans valeur propre.

  C11 -- Le "TOTAL solde" annuel (gains moins pertes additionnes sur 12
    mois) n'a pas de sens physique -- l'ete ne compense pas l'hiver sans
    stockage. Retire du resume ; remplace par les deux seuls indicateurs
    de synthese valides, deja utilises en Brique 5 : besoin_chauffage_kwh
    (somme des mois deficitaires) et apport_ete_kwh (risque de surchauffe,
    juin-aout). Le detail mensuel (transmission/solaire/solde) reste
    affiche tel quel, utile en lecture ligne par ligne.

Regle absolue (voir memoire feedback_jamais_de_donnee_inventee) : chaque
hypothese listee avec sa source. T_int=20degC reste une convention non
mesuree. U_vitrage reste teste en sensibilite (2 valeurs DPE, aucune
tranchee arbitrairement).

Lecture seule : ne modifie aucun fichier de frontend/data/batiment/.

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
MANUAL_SELECTION_PATH = os.path.join(SCRIPT_DIR, "manual_selection.json")

U_MUR = 0.40  # W/m2.K -- DPE Helene Berr section 3.1.1, "Batiment 1" (seule valeur disponible)
T_INT = 20.0  # degC -- consigne conventionnelle, non mesuree (hypothese documentee)

SCENARIOS_U_VITRAGE = {
    "double_vitrage_pvc (DPE, 2.0)": 2.0,
    "double_vitrage_pvc (DPE, 2.6)": 2.6,
}

# g (facteur solaire) par defaut sans aucune donnee de protection -- verre
# seul corrige cadre (alu ~25% d'emprise -> x0,75) et salissure/rideaux
# (x0,9), C8 de l'audit : 0,75 x 0,75 x 0,9 = 0,50625, arrondi 0,5.
G_SANS_DONNEE = 0.5

# Protection solaire EXISTANTE par segment reel, lue sur les planches DPA
# 2010 (C8/C9 de l'audit) -- remplace l'ancien g=0,75 "sans protection"
# comme etat reel actuel du batiment. g ci-dessous = valeur en SAISON
# D'USAGE (mai-septembre) du store concerne -- voir MOIS_STORES_RELEVES
# plus bas pour la valeur hors saison (N2 de la 2e passe d'audit : un store
# mobile n'est baisse par personne en hiver, meme sur les facades deja en
# protection exterieure).
PROTECTION_EXISTANTE = {
    0: {"type": "interieur", "g": 0.38, "source": "FACADE PICPUS : stores toiles interieurs. Gtot=0,38 : EN 13363-1 / ES-SO (store interieur clair + double vitrage, fourchette 0,35-0,45), valeur centrale retenue."},
    17: {"type": "interieur", "g": 0.38, "source": "FACADE PICPUS : stores toiles interieurs. Gtot=0,38 : EN 13363-1 / ES-SO, idem segment 0."},
    5: {"type": "interieur", "g": 0.38, "source": "FACADE REUILLY : stores toiles interieurs. Gtot=0,38 : EN 13363-1 / ES-SO, idem segment 0."},
    1: {"type": "exterieur", "g": 0.10, "source": "COUPE-FACADE SUD : stores toiles exterieurs (Gtot~0,10, ES-SO/ACTIBAIE)"},
    2: {"type": "exterieur", "g": 0.10, "source": "COUPE-FACADE SUD : stores toiles exterieurs"},
    3: {"type": "exterieur", "g": 0.10, "source": "COUPE-FACADE EST : stores toiles exterieurs + store a bannes RDC"},
    4: {"type": "aucune_donnee", "g": G_SANS_DONNEE, "source": "Aucune donnee de protection -- verre seul corrige cadre+salissure"},
    18: {"type": "aucune_donnee", "g": G_SANS_DONNEE, "source": "Quasi aveugle (2% vitrage), aucune donnee de protection"},
}

# Mois ou les stores mobiles (interieurs ou exterieurs) sont consideres
# RELEVES (N2, 2e passe d'audit) : octobre a avril, tout segment retombe
# au g "sans donnee" (verre+cadre+salissure, 0,50) -- personne ne baisse
# un store en hiver. Mai-septembre : g existant par segment (ci-dessus).
MOIS_STORES_RELEVES = (10, 11, 12, 1, 2, 3, 4)

# Pertes additionnelles de l'enveloppe, hors murs/vitrages (C10, C12) --
# constantes batiment entier, pas par facade.
SURFACE_EMPRISE_APUR_M2 = 400.0  # aire reelle (formule du lacet), manual_selection.json["9"].apur_rings
U_PLANCHER_BAS = 2.3  # W/m2.K -- DPE section 3.3.1
U_TOITURE = 0.6  # W/m2.K -- DPE section 3.4.1
# N3 (2e passe d'audit) : le plancher bas donne sur un sous-sol NON CHAUFFE
# (DPE §3.3.1 "sur locaux non chauffes" ; Coupe L1 : archives, local
# informatique, aire de livraison), pas sur l'exterieur direct -- coefficient
# b=0,5 (EN ISO 13789, sous-sol non chauffe) applique au plancher seulement.
# La toiture-terrasse, elle, donne bien sur l'exterieur direct -- pas de b.
B_PLANCHER_SOUS_SOL_NON_CHAUFFE = 0.5
H_PLANCHER = round(SURFACE_EMPRISE_APUR_M2 * U_PLANCHER_BAS * B_PLANCHER_SOUS_SOL_NON_CHAUFFE, 1)
H_TOITURE = round(SURFACE_EMPRISE_APUR_M2 * U_TOITURE, 1)
H_PLANCHER_TOITURE = round(H_PLANCHER + H_TOITURE, 1)  # W/K
# H_ventilation : ESTIMATION D'ORDRE DE GRANDEUR (borne haute, 0,6 vol/h en
# continu 24h/24, DPE §4.6 VMC simple flux + §3.2.3 grilles d'entree d'air)
# -- PAS une mesure. Fourchette reelle probable 600-1200 W/K selon horaires
# d'occupation reels d'une bibliotheque (non documentes).
H_VENTILATION = 1200.0  # W/K -- borne haute, voir note ci-dessus
H_ENVELOPPE_SUPP = H_PLANCHER_TOITURE + H_VENTILATION  # W/K

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


def calcule_bilan_facade(seg, hauteur_m_batiment, u_vitrage, g_effectif, lat, lon):
    """g_effectif : un seul nombre (applique toute l'annee) OU un dict
    {mois_1_12: g} pour un g saisonnier (ex. store mobile deploye seulement
    mai-septembre, C13)."""
    hauteur = seg.get("hauteur_segment_m") or hauteur_m_batiment
    surface_totale = seg["longueur_m"] * hauteur
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
        g_h = g_effectif[mois] if isinstance(g_effectif, dict) else g_effectif
        p_trans = H * (T_INT - t_ext)  # W (positif = perte)
        p_sol = irr * s_vitrage * g_h  # W
        par_mois[mois]["trans_wh"] += p_trans
        par_mois[mois]["sol_wh"] += p_sol

    return {
        m: {
            "transmission_kwh": round(v["trans_wh"] / 1000, 1),
            "solaire_kwh": round(v["sol_wh"] / 1000, 1),
            "solde_kwh": round((v["sol_wh"] - v["trans_wh"]) / 1000, 1),
        }
        for m, v in par_mois.items()
    }


def calcule_pertes_enveloppe_supp(lat, lon, segments):
    """Pertes plancher bas + toiture + ventilation (C10, C12), constantes
    batiment entier -- reutilise le cache horaire d'un segment quelconque
    pour T2m (la temperature exterieure ne depend pas de l'orientation)."""
    aspect = azimut_to_pvgis_aspect(segments[0]["azimut_deg"])
    hourly = load_hourly(lat, lon, aspect)
    par_mois = {m: 0.0 for m in range(1, 13)}
    for h in hourly:
        mois = int(h["time"][4:6])
        t_ext = h["T2m"]
        p = H_ENVELOPPE_SUPP * (T_INT - t_ext)
        par_mois[mois] += p
    return {m: round(v / 1000, 1) for m, v in par_mois.items()}


def additionne(agg, mois_dict):
    for m in range(1, 13):
        for k in ("transmission_kwh", "solaire_kwh", "solde_kwh"):
            agg[m][k] = round(agg[m].get(k, 0.0) + mois_dict[m][k], 1)


def besoin_chauffage_kwh(agg):
    return round(sum(-agg[m]["solde_kwh"] for m in range(1, 13) if agg[m]["solde_kwh"] < 0), 1)


def apport_ete_kwh(agg):
    return round(sum(agg[m]["solaire_kwh"] for m in (6, 7, 8)), 1)


def imprime_tableau(titre, agg):
    print(f"\n--- {titre} ---")
    print(f"{'Mois':<10} {'Transmission':>14} {'Apports solaires':>18} {'Solde':>10}  (kWh)")
    tot_trans, tot_sol = 0.0, 0.0
    for m in range(1, 13):
        v = agg[m]
        print(f"{MOIS_LABELS[m-1]:<10} {v['transmission_kwh']:>14.1f} {v['solaire_kwh']:>18.1f} {v['solde_kwh']:>10.1f}")
        tot_trans += v["transmission_kwh"]
        tot_sol += v["solaire_kwh"]
    print(f"{'TOTAL':<10} {tot_trans:>14.1f} {tot_sol:>18.1f} {'(voir ci-dessous)':>10}")
    print(f"  [!] Pas de \"TOTAL solde\" annuel -- additionner gains d'ete et pertes d'hiver n'a pas de sens")
    print(f"      physique (pas de stockage saisonnier). Indicateurs valides ci-dessous.")
    print(f"  Besoin de chauffage (saison deficitaire)  : {besoin_chauffage_kwh(agg)} kWh")
    print(f"  Risque de surchauffe ete (indicateur de confort, PAS une economie -- DPE 5.3 : aucune climatisation) : {apport_ete_kwh(agg)} kWh")


def calcule_scenario(segments, hauteur_m, u_vitrage, g_eff, lat, lon, inclure_enveloppe_supp=True):
    """g_eff : un nombre, un dict {index_segment: g}, ou un dict
    {index_segment: {mois: g}} pour une protection saisonniere (C13)."""
    agg = {m: {"transmission_kwh": 0.0, "solaire_kwh": 0.0, "solde_kwh": 0.0} for m in range(1, 13)}
    for seg in segments:
        if isinstance(g_eff, dict) and seg["index"] in g_eff:
            g_seg = g_eff[seg["index"]]
        elif isinstance(g_eff, dict):
            g_seg = G_SANS_DONNEE
        else:
            g_seg = g_eff
        mois_seg = calcule_bilan_facade(seg, hauteur_m, u_vitrage, g_seg, lat, lon)
        additionne(agg, mois_seg)
    if inclure_enveloppe_supp:
        pertes_supp = calcule_pertes_enveloppe_supp(lat, lon, segments)
        for m in range(1, 13):
            agg[m]["transmission_kwh"] = round(agg[m]["transmission_kwh"] + pertes_supp[m], 1)
            agg[m]["solde_kwh"] = round(agg[m]["solde_kwh"] - pertes_supp[m], 1)
    return agg


def g_baseline_par_segment():
    """g existant par segment, SAISONNIER (C8 + N2) : octobre-avril, tout
    segment retombe a G_SANS_DONNEE (stores relevees, personne ne les
    baisse en hiver) ; mai-septembre, g existant par segment."""
    return {
        idx: {m: (G_SANS_DONNEE if m in MOIS_STORES_RELEVES else v["g"]) for m in range(1, 13)}
        for idx, v in PROTECTION_EXISTANTE.items()
    }


MOIS_CHAUFFE = (10, 11, 12, 1, 2, 3, 4)


def conso_vapeur_reference_chauffage(mensuelles):
    """Reference annuelle de conso Vapeur (chauffage), avec detection
    d'anomalie -- regle donnee par l'audit Fable (3 verifications
    successives, N1) suite a la decouverte que 2025/2026 ont des valeurs de
    chauffe trop basses pour s'expliquer par la meteo (facture incomplete
    ou evenement reel, a confirmer aupres de Jean/gestionnaire -- PAS
    suppose ici). Distincte de annees_completes()/moyenne_mensuelle_reelle
    (gardees pour la conso toutes energies au m2, hors scope ici) :
      - DETECTION d'anomalie (perimetre oct-avril uniquement) : pour chaque
        mois de chauffe d'une annee candidate, reference = mediane du meme
        mois calendaire sur les AUTRES annees completes ; mois suspect si
        valeur < 0,33x reference ou > 3x reference ; annee exclue de la
        reference si >= 2 mois de chauffe suspects ; minimum 2 annees
        "autres" necessaires pour tester une annee, sinon pas d'exclusion
        possible (avertissement retourne).
      - REFERENCE retournee (perimetre 12 mois) : le modele compte tous les
        mois deficitaires de l'annee (mai/septembre inclus, residuellement
        deficitaires), donc la reference doit couvrir le total annuel des
        annees jugees valides ci-dessus -- pas seulement oct-avril, qui ne
        sert qu'a la detection.

    Retourne (reference_kwh, annees_valides, mois_suspects_par_annee,
    avertissement_ou_None)."""
    import statistics

    par_annee_mois = {}
    annees_toutes = set()
    for m in mensuelles:
        if m["energie"] != "Vapeur":
            continue
        annee, mois = m["mois"][:4], int(m["mois"][5:7])
        par_annee_mois[(annee, mois)] = m["kwh"]
        annees_toutes.add(annee)

    annees_candidates = sorted(a for a in annees_toutes if all((a, mo) in par_annee_mois for mo in MOIS_CHAUFFE))
    if len(annees_candidates) < 3:
        return None, [], {}, "Pas assez d'annees completes (minimum 3, pour que chaque annee ait au moins 2 autres annees de reference) -- aucune exclusion appliquee."

    mois_suspects_par_annee = {}
    annees_valides = []
    for a in annees_candidates:
        autres = [x for x in annees_candidates if x != a]
        suspects = []
        for mo in MOIS_CHAUFFE:
            valeurs_autres = [par_annee_mois[(x, mo)] for x in autres if (x, mo) in par_annee_mois]
            if len(valeurs_autres) < 2:
                continue
            ref = statistics.median(valeurs_autres)
            v = par_annee_mois[(a, mo)]
            if ref > 0 and (v < 0.33 * ref or v > 3 * ref):
                suspects.append(mo)
        mois_suspects_par_annee[a] = suspects
        if len(suspects) < 2:
            annees_valides.append(a)

    if not annees_valides:
        return None, [], mois_suspects_par_annee, "Toutes les annees candidates ont ete exclues comme anormales."

    # Le perimetre oct-avril (MOIS_CHAUFFE) ne sert qu'a la DETECTION d'anomalie
    # (etapes ci-dessus) -- la reference elle-meme doit couvrir les 12 mois,
    # car le modele compte tous les mois deficitaires de l'annee (mai/septembre
    # inclus, residuellement deficitaires), pas seulement oct-avril. Correction
    # suite a la clarification de l'audit Fable (3e verification).
    totaux = {
        a: sum(v for (an, mo), v in par_annee_mois.items() if an == a)
        for a in annees_valides
    }
    reference = round(sum(totaux.values()) / len(totaux), 1)
    return reference, annees_valides, mois_suspects_par_annee, None


RENDEMENT_DISTRIBUTION_HYPOTHESE = 0.9  # hypothese non sourcee (pas de DPE/document), reseau vapeur typique


def exporte_json(b, segments, hauteur_m, lat, lon, out_path, profil_reel, annees_reel, conso_vapeur, annees_vapeur, mois_suspects, avertissement_vapeur):
    scenarios = []
    g_base = g_baseline_par_segment()
    for label_u, u_vitrage in SCENARIOS_U_VITRAGE.items():
        agg = calcule_scenario(segments, hauteur_m, u_vitrage, g_base, lat, lon)
        mois = [
            {"mois": MOIS_LABELS[m - 1], "transmission_kwh": agg[m]["transmission_kwh"], "solaire_kwh": agg[m]["solaire_kwh"], "solde_kwh": agg[m]["solde_kwh"]}
            for m in range(1, 13)
        ]
        scenarios.append(
            {
                "nom": f"{label_u}, protection solaire existante (etat reel)",
                "u_vitrage": u_vitrage,
                "u_vitrage_label": label_u,
                "par_mois": mois,
                "besoin_chauffage_kwh": besoin_chauffage_kwh(agg),
                "apport_ete_kwh": apport_ete_kwh(agg),
            }
        )

    resultat = {
        "batiment_id": b["id"],
        "batiment_nom": b["nom"],
        "hauteur_m_batiment": hauteur_m,
        "nb_segments": len(segments),
        "hypotheses": {
            "u_mur": {"valeur": U_MUR, "unite": "W/m2.K", "note": "DPE Helene Berr, section 3.1.1, 'Batiment 1', etendu a tout le batiment"},
            "t_int": {"valeur": T_INT, "unite": "degC", "note": "convention non mesuree"},
            "u_vitrage_scenarios": list(SCENARIOS_U_VITRAGE.values()),
            "protection_solaire_existante_par_segment": PROTECTION_EXISTANTE,
            "h_plancher_toiture_w_k": H_PLANCHER_TOITURE,
            "h_ventilation_w_k": H_VENTILATION,
            "surface_emprise_apur_m2": SURFACE_EMPRISE_APUR_M2,
            "etape_cerema_comparaison": "NON FAITE -- pas d'acces a l'outil, blocage reel",
        },
        "comparaison_conso_reelle": {
            "profil_mensuel_kwh": ([{"mois": MOIS_LABELS[m - 1], "kwh": profil_reel[m]} for m in range(1, 13)] if profil_reel else None),
            "annees_utilisees": annees_reel or [],
            "mise_en_garde": (
                "Comparaison de forme (saisonnalite), pas de magnitude, et toutes energies confondues -- voir "
                "comparaison_vapeur ci-dessous pour la comparaison en magnitude, au bon poste (chauffage seul)."
            ),
        },
        "comparaison_vapeur": {
            "reference_chauffage_annuelle_kwh": conso_vapeur,
            "chaleur_livree_hypothese_kwh": (round(conso_vapeur * RENDEMENT_DISTRIBUTION_HYPOTHESE, 1) if conso_vapeur else None),
            "rendement_distribution_hypothese": RENDEMENT_DISTRIBUTION_HYPOTHESE,
            "annees_utilisees": annees_vapeur,
            "mois_suspects_par_annee": mois_suspects,
            "avertissement": avertissement_vapeur,
            "alerte_jean": (
                "Vapeur 2025-2026 anormalement basse par rapport a 2023-2024 (ex. novembre : 20-22 000 -> 1 000 "
                "kWh ; decembre : 29-30 000 -> 9 000 kWh) -- la baisse se poursuit en 2026 (janvier 12 000 contre "
                "30-40 000 les annees precedentes). Deux explications possibles, aucune confirmee ici : (1) le "
                "batiment consomme reellement beaucoup moins qu'avant (DPE et modele a reinterroger si confirme), "
                "(2) la facturation/le comptage DAC pour cette periode est incomplet ou errone. Seul Jean ou le "
                "gestionnaire du batiment peut trancher -- 2025 exclue de la reference de comparaison en attendant."
            ),
            "note": (
                "N1 (2e passe d'audit) : reference de chauffage = Vapeur seule (oct-avril), avec detection "
                "d'anomalie par mois (ecart x3 ou /3 a la mediane des autres annees) -- regle donnee par l'audit "
                "Fable, pas la meme regle que annees_completes()/moyenne_mensuelle_reelle (gardees pour la conso "
                "toutes energies au m2, qui reste le bon usage ailleurs dans le projet). Le rendement de "
                "distribution (0,9) est une HYPOTHESE non sourcee (pas de document la confirmant pour ce reseau "
                "vapeur), affichee separement de la reference brute, jamais fusionnee silencieusement."
            ),
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
    conso_vapeur, annees_vapeur, mois_suspects, avertissement_vapeur = conso_vapeur_reference_chauffage(b.get("consommations_mensuelles"))
    g_base = g_baseline_par_segment()

    print("=" * 70)
    print(f"POC bilan thermique horaire -- {b['nom']} (id {b['id']}) -- 2e passe de corrections (audit Fable)")
    print(f"Hauteur generale (repli) : {hauteur_m} m -- hauteurs differenciees par facade quand connues (C3)")
    print(f"U_mur = {U_MUR} W/m2.K (DPE, hypothese : applique a tout le batiment)")
    print(f"T_int = {T_INT} degC (consigne conventionnelle, non mesuree)")
    print(f"Pertes plancher (b=0,5, sous-sol non chauffe) : {H_PLANCHER} W/K -- toiture : {H_TOITURE} W/K -- total {H_PLANCHER_TOITURE} W/K")
    print(f"Pertes ventilation : {H_VENTILATION} W/K (estimation d'ordre de grandeur, borne haute -- pas une mesure)")
    print("Protection solaire EXISTANTE par segment, SAISONNIERE (C8+N2) :")
    for idx, v in PROTECTION_EXISTANTE.items():
        print(f"  Segment {idx} : g={v['g']} mai-sept. ({v['type']}), g={G_SANS_DONNEE} oct-avril (stores releves) -- {v['source']}")
    print("=" * 70)

    for label_u, u_vitrage in SCENARIOS_U_VITRAGE.items():
        agg = calcule_scenario(segments, hauteur_m, u_vitrage, g_base, lat, lon)
        imprime_tableau(f"{label_u}, protection solaire existante (etat reel, saisonniere)", agg)
        if conso_vapeur:
            chaleur_livree = round(conso_vapeur * RENDEMENT_DISTRIBUTION_HYPOTHESE, 1)
            ecart = besoin_chauffage_kwh(agg) - chaleur_livree
            ecart_pct = round(ecart / chaleur_livree * 100, 1)
            print(f"\n  Reference chauffage Vapeur, total annuel (annees valides {', '.join(annees_vapeur)}, oct-avril sert seulement a la detection d'anomalie) : {conso_vapeur} kWh/an")
            print(f"  Chaleur livree estimee (hypothese rendement distribution {RENDEMENT_DISTRIBUTION_HYPOTHESE}, non sourcee) : {chaleur_livree} kWh/an")
            print(f"  Ecart besoin calcule vs chaleur livree estimee : {ecart:+.1f} kWh ({ecart_pct:+.1f}%)")
        elif avertissement_vapeur:
            print(f"\n  [!] Comparaison Vapeur impossible : {avertissement_vapeur}")
        if profil_reel:
            print(f"  (pour reference, conso reelle TOUTES energies : {round(sum(profil_reel.values()),1)} kWh/an -- pas le bon comparatif, voir ci-dessus)")

    print("\n" + "=" * 70)
    print("RESUME DES HYPOTHESES (aucune n'est cachee) :")
    print(f"  - U_mur = {U_MUR} W/m2.K : DPE, 'Batiment 1', etendu a tout le batiment")
    print(f"  - U_vitrage : 2 valeurs DPE testees, pas de choix arbitraire ({list(SCENARIOS_U_VITRAGE.values())})")
    print(f"  - Protection solaire existante par segment, saisonniere (stores releves oct-avril)")
    print(f"  - Plancher bas avec coefficient b=0,5 (sous-sol non chauffe) + toiture + ventilation (estimation)")
    print(f"  - T_int = {T_INT} degC : convention non mesuree")
    print(f"  - Comparaison a la Vapeur seule (chauffage reel, oct-avril, annees anormales exclues), pas toutes energies")
    print("  - Etape 11 (comparaison Cerema) : NON FAITE -- pas d'acces a l'outil, blocage reel")
    if mois_suspects:
        for a, suspects in mois_suspects.items():
            if suspects:
                print(f"  - [!] Annee {a} : {len(suspects)} mois de chauffe suspects (ecart x3 a la mediane) -- exclue de la reference")
    print("=" * 70)
    print("\n[!] A SIGNALER A JEAN :")
    print("    Vapeur 2025-2026 anormalement basse vs 2023-2024 (ex. novembre 20-22k->1k kWh, decembre 29-30k->9k kWh),")
    print("    baisse qui se poursuit en 2026 (janvier 12k contre 30-40k les annees precedentes). Deux explications")
    print("    possibles, non confirmees ici : (1) le batiment consomme reellement moins (DPE/modele a reinterroger)")
    print("    (2) facturation/comptage DAC incomplet ou errone pour cette periode. A trancher par Jean/le gestionnaire.")

    out_path = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "poc", "helene_berr_resultat_brique3.json")
    exporte_json(b, segments, hauteur_m, lat, lon, out_path, profil_reel, annees_reel, conso_vapeur, annees_vapeur, mois_suspects, avertissement_vapeur)


if __name__ == "__main__":
    main()
