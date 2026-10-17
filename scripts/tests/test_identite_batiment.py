"""
Matrice de scenarios pour resoudre_identite() / verifie_identite_batiment()
(enrich_rnb_apur.py) -- CLAUDE.md section 2 : "une correction traite la
famille de cas, pas le cas signale". Caches RNB/APUR fabriques (pas de
requete reseau), pour tester chaque combinaison independamment :

  RNB  : correct / reordonne / rnb_id absent du cache / rnb_index hors bornes
  APUR : correct / republie (OBJECTID change, meme polygone) /
         OBJECTID reattribue a un autre batiment (polygone different)

Plus le scenario combine (RNB casse + APUR republie en meme temps) qui a
echappe aux versions precedentes, et le contre-exemple d'appariement.

Usage : python tests/test_identite_batiment.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import enrich_rnb_apur as E

# Deux polygones carres de 10x10, tres eloignes (aucun recouvrement possible)
RING_A = [(700000, 6860000), (700000, 6860010), (700010, 6860010), (700010, 6860000), (700000, 6860000)]
RING_LOIN = [(750000, 6900000), (750000, 6900010), (750010, 6900010), (750010, 6900000), (750000, 6900000)]
# RING_A decale de 2m sur x : recouvrement ~0.667 avec RING_A (ni 0% ni 100%,
# teste le SEUIL RECOUVREMENT_MIN lui-meme, pas juste "zero vs un").
RING_PARTIEL = [(700002, 6860000), (700002, 6860010), (700012, 6860010), (700012, 6860000), (700002, 6860000)]


def rnb_cand(rnb_id):
    return {"rnb_id": rnb_id, "addresses": [{"street_number": "1", "street": f"rue de {rnb_id}"}]}


def apur_feat(objectid, ring, h_moy=10.0):
    return {"attributes": {"OBJECTID": objectid, "h_moy": h_moy, "h_min": h_moy - 1, "h_max": h_moy + 1}, "geometry": {"rings": [ring]}}


def choice_de_base():
    return {"rnb_index": 0, "rnb_id": "AAA", "apur_objectid": 100, "apur_h_moy": 10.0, "apur_rings": [RING_A]}


def test_rnb_correct_apur_correct():
    """Cas nominal : tout correspond directement, aucune proposition."""
    rnb_data = {"results": [rnb_cand("AAA"), rnb_cand("ZZZ")]}
    apur_data = {"features": [apur_feat(100, RING_A), apur_feat(200, RING_LOIN)]}
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice_de_base(), rnb_data, apur_data)
    assert echec is None and not props
    assert rnb_c["rnb_id"] == "AAA" and apur_c["attributes"]["OBJECTID"] == 100


def test_rnb_reordonne():
    """RNB renvoie ses candidats dans un autre ordre -- doit retrouver AAA
    par rnb_id et proposer la correction de rnb_index, SANS planter ni
    mélanger avec ZZZ."""
    rnb_data = {"results": [rnb_cand("ZZZ"), rnb_cand("AAA")]}  # ordre inverse
    apur_data = {"features": [apur_feat(100, RING_A), apur_feat(200, RING_LOIN)]}
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice_de_base(), rnb_data, apur_data)
    assert echec is None
    assert rnb_c["rnb_id"] == "AAA"
    assert any(p["champ"] == "rnb_index" and p["nouveau"] == 1 for p in props)


def test_rnb_id_absent_du_cache():
    """AAA n'existe plus du tout dans le cache RNB -- doit bloquer
    proprement, jamais retomber sur un autre candidat par defaut."""
    rnb_data = {"results": [rnb_cand("ZZZ")]}
    apur_data = {"features": [apur_feat(100, RING_A)]}
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice_de_base(), rnb_data, apur_data)
    assert echec is not None and echec[0] == "rnb"
    assert rnb_c is None and apur_c is None


def test_rnb_index_hors_bornes_sans_rnb_id():
    """Anciennes entrees sans rnb_id enregistre, avec un rnb_index qui
    depasse la liste actuelle -- ne doit PAS lever IndexError."""
    choice = dict(choice_de_base())
    choice["rnb_id"] = None
    choice["rnb_index"] = 999
    rnb_data = {"results": [rnb_cand("ZZZ")]}
    apur_data = {"features": [apur_feat(100, RING_A)]}
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice, rnb_data, apur_data)
    assert echec is not None and echec[0] == "rnb"


def test_apur_republie_meme_polygone():
    """APUR change l'OBJECTID (republication) mais le polygone est
    identique -- doit se retrouver par recouvrement et proposer la
    correction, sans jamais etre silencieux."""
    rnb_data = {"results": [rnb_cand("AAA")]}
    apur_data = {"features": [apur_feat(999, RING_A)]}  # 100 -> 999, meme ring
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice_de_base(), rnb_data, apur_data)
    assert echec is None
    assert apur_c["attributes"]["OBJECTID"] == 999
    assert any(p["champ"] == "apur_objectid" and p["nouveau"] == 999 for p in props)


def test_apur_objectid_reattribue_a_un_autre_batiment():
    """L'OBJECTID stocke (100) existe toujours mais pointe maintenant vers
    un AUTRE polygone (loin) -- ne doit JAMAIS etre accepte tel quel, meme
    si "l'OBJECTID existe". Ici le vrai polygone A a disparu du cache :
    doit bloquer, pas halluciner un candidat."""
    rnb_data = {"results": [rnb_cand("AAA")]}
    apur_data = {"features": [apur_feat(100, RING_LOIN)]}  # 100 pointe ailleurs, A absent
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice_de_base(), rnb_data, apur_data)
    assert echec is not None and echec[0] == "apur"
    assert apur_c is None  # jamais le polygone eloigne accepte a tort


def test_apur_objectid_reattribue_mais_polygone_recuperable():
    """L'OBJECTID stocke (100) pointe ailleurs, MAIS le vrai polygone A est
    toujours present sous un autre OBJECTID (300) -- doit le retrouver par
    recouvrement et proposer la correction."""
    rnb_data = {"results": [rnb_cand("AAA")]}
    apur_data = {"features": [apur_feat(100, RING_LOIN), apur_feat(300, RING_A)]}
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice_de_base(), rnb_data, apur_data)
    assert echec is None
    assert apur_c["attributes"]["OBJECTID"] == 300
    assert any(p["champ"] == "apur_objectid" and p["nouveau"] == 300 for p in props)


def test_recouvrement_partiel_rejete_au_seuil_actuel():
    """Recouvrement de ~0.667 (ni 0% ni 100%) avec RECOUVREMENT_MIN=0.95 --
    doit etre rejete. Si RECOUVREMENT_MIN etait abaisse a 0.5 sans que ce
    test soit revu, ce cas serait accepte a tort : le test echouerait alors
    (echec deviendrait None), ce qui est le but."""
    choice = choice_de_base()
    rnb_data = {"results": [rnb_cand("AAA")]}
    apur_data = {"features": [apur_feat(100, RING_PARTIEL)]}  # meme id, geometrie decalee
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice, rnb_data, apur_data)
    assert echec is not None and echec[0] == "apur"
    assert apur_c is None


def test_verdict_final_revalide_sans_empreinte_geometrique():
    """Sans apur_rings enregistre (anciennes entrees), resoudre_identite()
    retrouve RNB et APUR directement par id -- mais DOIT quand meme rappeler
    verifie_identite_batiment() (repli sur la hauteur) avant de conclure.
    Sans cet appel final, un h_moy tres different de celui attendu serait
    accepte en silence des que rnb_id et apur_objectid matchent tout seuls."""
    choice = {"rnb_index": 0, "rnb_id": "AAA", "apur_objectid": 100, "apur_h_moy": 10.0}  # pas de apur_rings
    rnb_data = {"results": [rnb_cand("AAA")]}
    apur_data = {"features": [apur_feat(100, RING_A, h_moy=50.0)]}  # meme id, hauteur tres differente
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice, rnb_data, apur_data)
    assert echec is not None and echec[0] == "apur"
    assert apur_c is None


def test_scenario_combine_rnb_et_apur_casses_simultanement():
    """LE scenario qui a echappe aux versions precedentes : RNB reordonne
    ET APUR republie en meme temps. Les DEUX doivent etre verifies et
    repares independamment -- jamais de rnb_cand faux associe a un
    apur_cand juste (ou l'inverse)."""
    rnb_data = {"results": [rnb_cand("ZZZ"), rnb_cand("AAA")]}  # reordonne
    apur_data = {"features": [apur_feat(999, RING_A), apur_feat(200, RING_LOIN)]}  # republie
    rnb_c, apur_c, props, echec = E.resoudre_identite(choice_de_base(), rnb_data, apur_data)
    assert echec is None
    assert rnb_c["rnb_id"] == "AAA"  # jamais ZZZ
    assert apur_c["attributes"]["OBJECTID"] == 999
    champs = {p["champ"] for p in props}
    assert champs == {"rnb_index", "apur_objectid"}  # les DEUX proposes


def test_appariement_contre_exemple_cout_prohibitif():
    """Sans cout prohibitif hors tolerance, l'affectation hongroise peut
    choisir une mauvaise paire globale alors qu'une paire valide existe
    (contre-exemple trouve par une revue de code)."""
    anciens = [
        {"index": 0, "orientation": "N", "longueur_m": 5.0, "azimut_deg": 0.0, "bruit": False},
        {"index": 1, "orientation": "N", "longueur_m": 8.0, "azimut_deg": 0.0, "bruit": False},
    ]
    nouveaux = [
        {"index": 0, "orientation": "N", "longueur_m": 6.4, "azimut_deg": 0.0, "bruit": False},
        {"index": 1, "orientation": "N", "longueur_m": 3.4, "azimut_deg": 0.0, "bruit": False},
    ]
    paires, non_apparies = E.apparier_facades_par_geometrie(anciens, nouveaux)
    assert len(paires) == 1
    assert paires[0][0]["longueur_m"] == 5.0 and paires[0][1]["longueur_m"] == 6.4
    assert len(non_apparies) == 1 and non_apparies[0]["longueur_m"] == 8.0


if __name__ == "__main__":
    tests = [
        test_rnb_correct_apur_correct,
        test_rnb_reordonne,
        test_rnb_id_absent_du_cache,
        test_rnb_index_hors_bornes_sans_rnb_id,
        test_apur_republie_meme_polygone,
        test_apur_objectid_reattribue_a_un_autre_batiment,
        test_apur_objectid_reattribue_mais_polygone_recuperable,
        test_recouvrement_partiel_rejete_au_seuil_actuel,
        test_verdict_final_revalide_sans_empreinte_geometrique,
        test_scenario_combine_rnb_et_apur_casses_simultanement,
        test_appariement_contre_exemple_cout_prohibitif,
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
