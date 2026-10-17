"""
Tests d'integration sur cmd_compute() lui-meme -- les tests precedents
(test_identite_batiment.py) n'appellent que resoudre_identite() et
apparier_facades_par_geometrie() directement, jamais compute() : confirme
par une revue que ca laisse passer sans echec la suppression du blocage sur
proposition en attente, ou la reintroduction d'une reecriture automatique de
manual_selection.json -- les deux regles centrales du CLAUDE.md.

Usage : python tests/test_compute_integration.py
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import enrich_rnb_apur as E

RING_A = [(700000, 6860000), (700000, 6860010), (700010, 6860010), (700010, 6860000), (700000, 6860000)]


def _rnb_cand(rnb_id):
    return {"rnb_id": rnb_id, "distance": 0.0, "addresses": [{"street_number": "1", "street": "rue test"}]}


def _apur_feat(objectid, ring=RING_A, h_moy=9.0):
    return {"attributes": {"OBJECTID": objectid, "h_moy": h_moy, "h_min": h_moy - 1, "h_max": h_moy + 1, "Shape_Area": 100.0},
            "geometry": {"rings": [ring]}}


class EnvironnementTest:
    """Redirige les constantes de chemin du module vers un repertoire
    temporaire, restaure a la sortie -- jamais de test qui touche le vrai
    manual_selection.json du projet."""

    def __enter__(self):
        self.tmp = tempfile.mkdtemp()
        self.anciens = {}
        for attr in ("RAW_RNB_DIR", "RAW_APUR_DIR", "RAW_REVIEW_DIR", "OUT_DIR",
                     "MANUAL_SELECTION_PATH", "MANUAL_SELECTION_PROPOSED_PATH", "FRONTEND_DATA_DIR"):
            self.anciens[attr] = getattr(E, attr)
        E.RAW_RNB_DIR = os.path.join(self.tmp, "raw", "rnb")
        E.RAW_APUR_DIR = os.path.join(self.tmp, "raw", "apur")
        E.RAW_REVIEW_DIR = os.path.join(self.tmp, "raw", "review")
        E.OUT_DIR = os.path.join(self.tmp, "out")
        E.FRONTEND_DATA_DIR = os.path.join(self.tmp, "frontend_data")
        E.MANUAL_SELECTION_PATH = os.path.join(self.tmp, "manual_selection.json")
        E.MANUAL_SELECTION_PROPOSED_PATH = os.path.join(self.tmp, "manual_selection_reparations_proposees.json")
        os.makedirs(E.RAW_RNB_DIR)
        os.makedirs(E.RAW_APUR_DIR)
        os.makedirs(E.FRONTEND_DATA_DIR)
        return self

    def __exit__(self, *a):
        for attr, val in self.anciens.items():
            setattr(E, attr, val)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def ecrire_batiment(self, bid, rnb_data, apur_data, choice, nombre_etages=3):
        with open(os.path.join(E.RAW_RNB_DIR, f"{bid}.json"), "w", encoding="utf-8") as f:
            json.dump(rnb_data, f)
        with open(os.path.join(E.RAW_APUR_DIR, f"{bid}.json"), "w", encoding="utf-8") as f:
            json.dump(apur_data, f)
        with open(os.path.join(E.FRONTEND_DATA_DIR, f"{bid}.json"), "w", encoding="utf-8") as f:
            json.dump({"batiment": {"nom": f"Test {bid}", "latitude": 48.85, "longitude": 2.35,
                                     "nombre_etages": nombre_etages}}, f)
        with open(E.MANUAL_SELECTION_PATH, "w", encoding="utf-8") as f:
            json.dump({str(bid): choice}, f)

    def run_compute(self):
        try:
            E.cmd_compute()
            return 0
        except SystemExit as e:
            return e.code

    def out_existe(self, bid):
        return os.path.exists(os.path.join(E.OUT_DIR, f"{bid}_enrichment.json"))

    def lire_sortie(self, bid):
        with open(os.path.join(E.OUT_DIR, f"{bid}_enrichment.json"), encoding="utf-8") as f:
            return json.load(f)

    def selection_hash(self):
        with open(E.MANUAL_SELECTION_PATH, "rb") as f:
            import hashlib
            return hashlib.md5(f.read()).hexdigest()

    def propositions(self):
        if not os.path.exists(E.MANUAL_SELECTION_PROPOSED_PATH):
            return None
        with open(E.MANUAL_SELECTION_PROPOSED_PATH, encoding="utf-8") as f:
            return json.load(f)


def test_nominal_ecrit_sortie_et_ne_touche_pas_la_selection():
    with EnvironnementTest() as env:
        choice = {"rnb_index": 0, "rnb_id": "AAA", "apur_objectid": 100, "apur_h_moy": 9.0, "apur_rings": [RING_A]}
        env.ecrire_batiment(2, {"results": [_rnb_cand("AAA")]}, {"features": [_apur_feat(100)]}, choice)
        hash_avant = env.selection_hash()
        code = env.run_compute()
        assert code == 0
        assert env.out_existe(2)
        assert env.selection_hash() == hash_avant
        assert env.propositions() is None


def test_proposition_en_attente_bloque_la_sortie():
    """REGLE CENTRALE : une reparation possible, meme evidente, ne doit
    JAMAIS produire de sortie ecrite ni modifier manual_selection.json --
    seulement une proposition dans un fichier separe."""
    with EnvironnementTest() as env:
        choice = {"rnb_index": 0, "rnb_id": "AAA", "apur_objectid": 100, "apur_h_moy": 9.0, "apur_rings": [RING_A]}
        # RNB reordonne : AAA est maintenant en position 1, pas 0
        env.ecrire_batiment(2, {"results": [_rnb_cand("ZZZ"), _rnb_cand("AAA")]}, {"features": [_apur_feat(100)]}, choice)
        hash_avant = env.selection_hash()
        code = env.run_compute()
        assert code == 1  # au moins une erreur
        assert not env.out_existe(2)  # REGLE CENTRALE 1 : pas de sortie
        assert env.selection_hash() == hash_avant  # REGLE CENTRALE 2 : jamais reecrit
        props = env.propositions()
        assert props is not None and len(props) == 1
        assert props[0]["champ"] == "rnb_index" and props[0]["nouveau"] == 1


def test_fichier_propositions_absent_si_rien_a_proposer():
    with EnvironnementTest() as env:
        choice = {"rnb_index": 0, "rnb_id": "AAA", "apur_objectid": 100, "apur_h_moy": 9.0, "apur_rings": [RING_A]}
        env.ecrire_batiment(2, {"results": [_rnb_cand("AAA")]}, {"features": [_apur_feat(100)]}, choice)
        env.run_compute()
        assert env.propositions() is None


def test_statut_suspect_donne_rnb_verifie_false():
    """Contrairement a une derive d'identite (bloque, pas de sortie), un
    ecart hauteur/etages enorme SANS note ('suspect') ecrit quand meme une
    sortie -- mais avec rnb_verifie=False, pour signaler a la fusion
    MANUELLE de ne pas la reprendre sans verification (jamais 'suspect' au
    hasard confondu avec 'verifie')."""
    with EnvironnementTest() as env:
        choice = {"rnb_index": 0, "rnb_id": "AAA", "apur_objectid": 100, "apur_h_moy": 50.0, "apur_rings": [RING_A]}
        # h_moy=50m avec 3 etages attendus -> ecart enorme, pas de note
        env.ecrire_batiment(2, {"results": [_rnb_cand("AAA")]}, {"features": [_apur_feat(100, h_moy=50.0)]},
                             choice, nombre_etages=3)
        code = env.run_compute()
        assert env.out_existe(2)  # suspect ecrit quand meme une sortie
        sortie = env.lire_sortie(2)
        assert sortie["rnb_verifie"] is False
        assert sortie["hauteur_verification"]["statut"] == "suspect"


def test_fichier_propositions_perime_est_purge():
    """Une proposition d'une execution precedente (probleme depuis resolu)
    ne doit jamais rester sur le disque sans etre signalee."""
    with EnvironnementTest() as env:
        choice = {"rnb_index": 0, "rnb_id": "AAA", "apur_objectid": 100, "apur_h_moy": 9.0, "apur_rings": [RING_A]}
        env.ecrire_batiment(2, {"results": [_rnb_cand("AAA")]}, {"features": [_apur_feat(100)]}, choice)
        with open(E.MANUAL_SELECTION_PROPOSED_PATH, "w", encoding="utf-8") as f:
            json.dump([{"batiment": 2, "champ": "perime", "ancien": 1, "nouveau": 2, "preuve": "test"}], f)
        env.run_compute()
        assert env.propositions() is None  # purge, pas de residu


if __name__ == "__main__":
    tests = [
        test_nominal_ecrit_sortie_et_ne_touche_pas_la_selection,
        test_proposition_en_attente_bloque_la_sortie,
        test_fichier_propositions_absent_si_rien_a_proposer,
        test_statut_suspect_donne_rnb_verifie_false,
        test_fichier_propositions_perime_est_purge,
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
