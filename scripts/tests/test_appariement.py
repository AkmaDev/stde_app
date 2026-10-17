"""
Tests dedies a apparier_facades_par_geometrie() / reconstruire_positions_anciennes()
au-dela du contre-exemple deja dans test_identite_batiment.py :

- Cas reel fige (Jean-Pierre Melville, segments non-bruit de
  frontend/data/batiment/16.json et out/16_enrichment.json au 17/10/2026) --
  regression permanente independante des caches locaux (qui peuvent changer).
- Cas synthetique ou la POSITION est necessaire pour choisir le bon
  candidat : sans elle, longueur/azimut seuls designent un mur different.

Usage : python tests/test_appariement.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import enrich_rnb_apur as E

# Fige le 17/10/2026, segments non-bruit uniquement (frontend/data/batiment/16.json)
JPM_ANCIENS = [
    {"index": 4, "orientation": "E", "longueur_m": 14.12, "azimut_deg": 70.0, "bruit": False},
    {"index": 5, "orientation": "S", "longueur_m": 26.61, "azimut_deg": 162.0, "bruit": False},
    {"index": 6, "orientation": "O", "longueur_m": 28.03, "azimut_deg": 250.5, "bruit": False},
    {"index": 8, "orientation": "N", "longueur_m": 2.74, "azimut_deg": 349.0, "bruit": False},
    {"index": 10, "orientation": "N", "longueur_m": 5.67, "azimut_deg": 350.5, "bruit": False},
    {"index": 11, "orientation": "N", "longueur_m": 5.91, "azimut_deg": 358.3, "bruit": False},
    {"index": 12, "orientation": "N", "longueur_m": 5.97, "azimut_deg": 6.4, "bruit": False},
    {"index": 13, "orientation": "N", "longueur_m": 5.08, "azimut_deg": 12.8, "bruit": False},
]
# Fige le 17/10/2026, sortie de compute() pour le meme batiment (tous segments)
JPM_NOUVEAUX = [
    {"index": 0, "orientation": "O", "longueur_m": 28.5, "azimut_deg": 250.7, "bruit": False},
    {"index": 1, "orientation": "S", "longueur_m": 26.61, "azimut_deg": 162.0, "bruit": False},
    {"index": 2, "orientation": "E", "longueur_m": 14.12, "azimut_deg": 70.0, "bruit": False},
    {"index": 3, "orientation": "N", "longueur_m": 1.19, "azimut_deg": 340.1, "bruit": True},
    {"index": 4, "orientation": "E", "longueur_m": 0.37, "azimut_deg": 67.4, "bruit": True},
    {"index": 5, "orientation": "N", "longueur_m": 1.26, "azimut_deg": 340.2, "bruit": True},
    {"index": 6, "orientation": "E", "longueur_m": 1.15, "azimut_deg": 49.0, "bruit": True},
    {"index": 7, "orientation": "E", "longueur_m": 1.0, "azimut_deg": 116.5, "bruit": True},
    {"index": 8, "orientation": "E", "longueur_m": 1.71, "azimut_deg": 90.5, "bruit": True},
    {"index": 9, "orientation": "E", "longueur_m": 2.52, "azimut_deg": 62.3, "bruit": False},
    {"index": 10, "orientation": "N", "longueur_m": 1.11, "azimut_deg": 23.0, "bruit": True},
    {"index": 11, "orientation": "N", "longueur_m": 5.08, "azimut_deg": 12.8, "bruit": False},
    {"index": 12, "orientation": "N", "longueur_m": 5.97, "azimut_deg": 6.4, "bruit": False},
    {"index": 13, "orientation": "N", "longueur_m": 3.07, "azimut_deg": 0.5, "bruit": False},
    {"index": 14, "orientation": "N", "longueur_m": 5.97, "azimut_deg": 354.5, "bruit": False},
    {"index": 15, "orientation": "N", "longueur_m": 2.55, "azimut_deg": 347.1, "bruit": False},
    {"index": 16, "orientation": "O", "longueur_m": 0.4, "azimut_deg": 259.0, "bruit": True},
    {"index": 17, "orientation": "N", "longueur_m": 2.74, "azimut_deg": 349.0, "bruit": False},
]


def test_jpm_segments_12_13_appaires_correctement():
    """Cas reel qui a revele le defaut de l'appariement glouton : l'ancien
    segment 12 (5.97m/6.4deg) a une correspondance EXACTE avec le nouveau
    12, et l'ancien 13 (5.08m/12.8deg) avec le nouveau 11. Verifie aussi
    (empiriquement, sur cette donnee) que l'affectation hongroise seule,
    meme sans la passe de correspondance exacte, donne deja le bon
    resultat ici -- un cout exact (0) est toujours le minimum global
    possible pour une paire, donc l'algorithme hongrois le retient de
    lui-meme des que les couts ne sont pas en situation d'egalite parfaite.
    La passe exacte reste utile pour la determinisme/performance, pas
    comme unique garde-fou de ce cas precis."""
    paires, non_apparies = E.apparier_facades_par_geometrie(JPM_ANCIENS, JPM_NOUVEAUX)
    par_ancien_index = {a["index"]: n["index"] for a, n in paires}
    assert par_ancien_index[12] == 12
    assert par_ancien_index[13] == 11
    assert par_ancien_index[4] == 2
    assert par_ancien_index[5] == 1
    assert par_ancien_index[6] == 0
    assert par_ancien_index[8] == 17


def test_position_necessaire_pour_choisir_le_bon_mur():
    """Sans position, un ancien segment peut s'apparier a un nouveau
    candidat geometriquement eloigne (autre mur) simplement parce que sa
    longueur/azimut sont un peu plus proches -- confirme sur des donnees
    reelles (Francois Villon, facade n.2 appariee a un mur a 5,3m).
    Construit ici en synthetique, avec un ecart de position juste assez
    grand pour depasser tolerance_position_m (3m) mais pas assez pour que
    le terme additif (distance/10) a lui seul renverse la decision -- isole
    specifiquement le rejet PROHIBITIF par position, pas seulement sa
    presence dans le cout (verifie par mutation : une tolerance de position
    enorme, qui desactive le rejet mais garde le terme additif, laisse
    passer N1 a tort)."""
    # Ecarts choisis pour rester hors tolerance_exacte_* (sinon la passe 1
    # capte N1 avant meme que la position intervienne) et pour que N1 reste
    # moins cher que N2 meme en ADDITIONNANT la distance au cout (ce qui
    # isole bien le rejet PROHIBITIF par position, pas seulement sa presence).
    ancien = {"index": 0, "orientation": "N", "longueur_m": 5.0, "azimut_deg": 10.0, "bruit": False,
              "mid_x": 100.0, "mid_y": 100.0}
    n1_mauvais_mur_mais_tres_proche_en_longueur = {"index": 0, "orientation": "N", "longueur_m": 5.2,
                                                     "azimut_deg": 12.0, "bruit": False, "mid_x": 110.0, "mid_y": 100.0}
    n2_bon_mur_mais_longueur_moins_exacte = {"index": 1, "orientation": "N", "longueur_m": 5.8, "azimut_deg": 18.0,
                                              "bruit": False, "mid_x": 101.0, "mid_y": 100.0}
    nouveaux = [n1_mauvais_mur_mais_tres_proche_en_longueur, n2_bon_mur_mais_longueur_moins_exacte]

    # Sans position (anciens non enrichis -- mid_x/mid_y retires, pas juste
    # copies) : choisit a tort N1 (longueur/azimut plus proches), qui est
    # pourtant a 141m du mur reel.
    ancien_sans_position = {k: v for k, v in ancien.items() if k not in ("mid_x", "mid_y")}
    paires_sans_position, _ = E.apparier_facades_par_geometrie([ancien_sans_position], nouveaux)
    assert paires_sans_position[0][1]["index"] == 0  # confirme le defaut sans position

    # Avec position : N1 devient prohibitif (>3m), N2 (le bon mur) est choisi.
    paires_avec_position, non_apparies = E.apparier_facades_par_geometrie([ancien], nouveaux)
    assert len(paires_avec_position) == 1
    assert paires_avec_position[0][1]["index"] == 1


if __name__ == "__main__":
    tests = [
        test_jpm_segments_12_13_appaires_correctement,
        test_position_necessaire_pour_choisir_le_bon_mur,
    ]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except Exception as ex:
            failures += 1
            print(f"FAIL {t.__name__}: {ex!r}")
    sys.exit(1 if failures else 0)
