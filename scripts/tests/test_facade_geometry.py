"""
Tests de non-regression geometrique pour polygon_to_facades() /
polygon_with_holes_to_facades() (enrich_rnb_apur.py).

Origine : adapte d'une suite de tests ecrite par une autre IA lors d'une
revue de code de ce script (property-based testing avec Hypothesis +
oracle dedans/dehors), relue et verifiee avant integration -- voir le plan
C:\\Users\\manew\\.claude\\plans\\joyful-giggling-crystal.md pour le contexte
complet des bugs trouves et corriges (inversion de facade a 180 deg sur
contour concave, fusion de murs dependante du sens de parcours, patio
oriente a l'envers).

Usage : python tests/test_facade_geometry.py
(ou via pytest si installe : pytest tests/)
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from shapely.geometry import Point, Polygon
from hypothesis import given, settings, strategies as st, HealthCheck

import enrich_rnb_apur as E


def star(radii, rot=0.0, cw=True):
    """Polygone synthetique en etoile/forme irreguliere (convexe ou concave
    selon les rayons) -- generateur reutilise de la suite d'origine."""
    n = len(radii)
    pts = []
    for k, r in enumerate(radii):
        t = 2 * math.pi * k / n + rot
        pts.append((r * math.cos(t) + 700000, r * math.sin(t) + 6860000))
    if cw:
        pts = pts[::-1]
    return pts + [pts[0]]


def outward_ok(ring, eps_frac=20):
    """Pour chaque facade produite, verifie qu'un point juste derriere la
    normale (cote declare 'exterieur') est bien HORS du polygone, et qu'un
    point juste devant (cote interieur) est bien DEDANS. Reutilise
    exactement les memes etapes internes que polygon_to_facades() (pas de
    recalcul separe) pour eviter toute divergence entre le test et le code
    teste.

    Le test de dedans/dehors se fait contre le polygone SIMPLIFIE (pas
    l'original brut) : les facades produites DECRIVENT le polygone simplifie
    (shapely.simplify, tolerance SIMPLIFY_TOLERANCE_M), qui peut legerement
    s'ecarter du contour source -- tester contre l'original ferait
    ponctuellement echouer le test sur de petites formes synthetiques ou la
    tolerance de simplification est grande par rapport a la taille de la
    forme, sans que ce soit un bug de l'orientation elle-meme (l'invariant
    pertinent est "les facades decrivent correctement CE QUE LE POLYGONE
    SIMPLIFIE REPRESENTE", pas le contour avant simplification)."""
    poly_simpl = E._normalized_polygon([ring])
    c = list(poly_simpl.exterior.coords)
    segs = E._coords_to_facades(c)
    for (x1, y1), (x2, y2), s in zip(c, c[1:], segs):
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        a = math.radians(s["azimut_deg"])
        nx, ny = math.sin(a), math.cos(a)
        eps = min(0.01, s["longueur_m"] / eps_frac) if s["longueur_m"] > 0 else 0.01
        dehors = not poly_simpl.contains(Point(mx + eps * nx, my + eps * ny))
        dedans = poly_simpl.contains(Point(mx - eps * nx, my - eps * ny))
        if not (dehors and dedans):
            return False
    return True


def outward_ok_with_holes(rings, eps_frac=20):
    """Variante de outward_ok() pour un polygone AVEC trou(s) : teste
    dedans/dehors contre le polygone COMPLET (exterieur moins les trous), pas
    seulement contre l'ensemble des orientations produites -- un carre
    entierement inverse produirait le meme multi-ensemble {E,N,O,S} qu'un
    carre correctement oriente, donc une simple comparaison d'ensembles ne
    detecte pas une inversion totale (trouve par mutation : inverser toutes
    les normales du patio laissait passer l'ancienne version du test).

    IMPORTANT : appelle E.polygon_with_holes_to_facades(rings) -- la VRAIE
    fonction testee, utilisee par cmd_compute() -- et non un recalcul manuel
    des segments. Une premiere version de ce test appelait elle-meme
    E._coords_to_facades() pour reconstruire sa propre reponse puis
    verifiait son propre calcul : un bug qui n'existerait QUE dans
    polygon_with_holes_to_facades() (ex. mauvais regroupement
    exterieur/patio) n'aurait jamais ete detecte -- confirme par mutation
    (inverser uniquement les facades du patio dans
    polygon_with_holes_to_facades laissait passer les 5 tests)."""
    poly_simpl = E._normalized_polygon(rings)  # coordonnees de reference uniquement
    anneaux_coords = [list(poly_simpl.exterior.coords)] + [list(r.coords) for r in poly_simpl.interiors]

    segs = E.polygon_with_holes_to_facades(rings)  # la vraie fonction testee

    idx = 0
    for coords in anneaux_coords:
        for (x1, y1), (x2, y2) in zip(coords, coords[1:]):
            s = segs[idx]
            idx += 1
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            a = math.radians(s["azimut_deg"])
            nx, ny = math.sin(a), math.cos(a)
            eps = min(0.01, s["longueur_m"] / eps_frac) if s["longueur_m"] > 0 else 0.01
            dehors = not poly_simpl.contains(Point(mx + eps * nx, my + eps * ny))
            dedans = poly_simpl.contains(Point(mx - eps * nx, my - eps * ny))
            if not (dehors and dedans):
                return False
    return True


radii_strategy = st.lists(st.floats(3, 40), min_size=3, max_size=40)


@settings(max_examples=500, suppress_health_check=[HealthCheck.too_slow])
@given(radii_strategy, st.floats(0, 2 * math.pi), st.booleans())
def test_normals_point_outside(rs, rot, cw):
    ring = star(rs, rot, cw)
    if not Polygon(ring).is_valid:
        return
    assert outward_ok(ring)


@settings(max_examples=300)
@given(radii_strategy)
def test_direction_of_travel_irrelevant(rs):
    """Le meme polygone, parcouru dans les deux sens, doit donner le meme
    ensemble de facades (longueurs + orientations) -- c'etait faux avant la
    migration vers Shapely (fusion par angle dependante du point de depart)."""
    s1 = E.polygon_to_facades(star(rs, 0, True))
    s2 = E.polygon_to_facades(star(rs, 0, False))
    assert sorted(round(x["longueur_m"], 1) for x in s1) == sorted(round(x["longueur_m"], 1) for x in s2)
    assert sorted(x["orientation"] for x in s1) == sorted(x["orientation"] for x in s2)


def test_direction_of_travel_irrelevant_contre_exemple_fige():
    """Cas trouve par recherche aleatoire (retrait de normalize() dans
    _normalized_polygon) : le test Hypothesis ci-dessus ne le detecte que
    par chance selon le tirage -- fige ici en cas fixe pour une detection
    garantie, independante du hasard."""
    rs = [4.491251666886823, 14.898098841989949, 32.52863857491835, 38.67240325485007,
          6.946425145681676, 35.472658235913634, 4.802553835031892]
    s1 = E.polygon_to_facades(star(rs, 0, True))
    s2 = E.polygon_to_facades(star(rs, 0, False))
    assert sorted(round(x["longueur_m"], 1) for x in s1) == sorted(round(x["longueur_m"], 1) for x in s2)


def test_patio_hole_oriented_inward():
    """Un trou (patio) carre au centre d'un grand contour exterieur doit
    produire 4 facades, une par orientation N/E/S/O, chacune tournee VERS le
    centre du patio (pas vers l'exterieur du batiment) -- c'etait invers
    avant la migration vers Shapely (orient() force la bonne convention pour
    les deux types d'anneaux en une seule formule).

    Verifie par un vrai test dedans/dehors sur le polygone AVEC trou
    (outward_ok_with_holes), pas seulement par l'ensemble des orientations
    produites : un patio ENTIEREMENT inverse produit le meme multi-ensemble
    {E,N,O,S} qu'un patio correct, donc une comparaison d'ensembles seule ne
    detecte pas ce cas (trouve par mutation lors d'une revue -- l'ancienne
    version de ce test passait meme en inversant toutes les normales)."""
    outer = [(-20, -20), (-20, 30), (30, 30), (30, -20), (-20, -20)]
    hole = [(0, 0), (0, 10), (10, 10), (10, 0), (0, 0)]
    rings = [outer, hole]
    segs = E.polygon_with_holes_to_facades(rings)
    patio_segs = [s for s in segs if s["anneau"] == "patio"]
    assert len(patio_segs) == 4
    assert sorted(s["orientation"] for s in patio_segs) == ["E", "N", "O", "S"]
    assert outward_ok_with_holes(rings)


class Skipped(Exception):
    """Leve par un test pour signaler explicitement qu'il n'a pas pu
    s'executer (cache/empreinte absente), distinct d'un echec (FAIL) ou
    d'une reussite (PASS) -- un test qui se contente de 'return' sans rien
    verifier compterait a tort comme un succes dans le runner."""


def test_buffon_facade_nord_reference():
    """Cas de reference reel (pas synthetique) : la facade Nord de Buffon
    doit rester un seul mur de 42,18m apres simplification, pas 4 segments de
    12+4+15+11m comme avant la fusion par distance -- detecterait une
    regression si SIMPLIFY_TOLERANCE_M etait retire ou mal configure (trou de
    couverture confirme par mutation : aucun test existant ne verifiait la
    fusion elle-meme, seulement l'orientation apres fusion).

    Retrouve le bon candidat dans le cache APUR actuel par recouvrement
    geometrique (comme recherche_par_recouvrement(), via apur_rings de
    manual_selection.json) plutot que par un OBJECTID code en dur -- un
    OBJECTID fige dans le test casse (StopIteration) des la prochaine
    republication APUR (confirme : c'est exactement le bug qui touchait
    Jean-Pierre Melville, reproduit ici volontairement pour le test)."""
    selection_path = os.path.join(os.path.dirname(__file__), "..", "manual_selection.json")
    apur_path = os.path.join(os.path.dirname(__file__), "..", "raw", "apur", "2.json")
    if not os.path.exists(selection_path) or not os.path.exists(apur_path):
        raise Skipped("manual_selection.json ou raw/apur/2.json absent dans cet environnement")
    with open(selection_path, encoding="utf-8") as f:
        choice = json.load(f)["2"]
    rings_attendus = choice.get("apur_rings")
    if rings_attendus is None:
        raise Skipped("apur_rings absent pour le batiment 2 -- lancer backfill_apur_rings.py")
    with open(apur_path, encoding="utf-8") as f:
        apur_data = json.load(f)
    feat, score = E.recherche_par_recouvrement(apur_data, rings_attendus)
    if feat is None:
        raise Skipped(f"aucun candidat APUR actuel ne recouvre l'empreinte enregistree (meilleur score {score:.1%})")
    segs = E.polygon_with_holes_to_facades(feat["geometry"]["rings"])
    nord = [s for s in segs if s["anneau"] == "exterieur" and s["orientation"] == "N" and not s["bruit"]]
    assert len(nord) == 1, f"attendu 1 facade Nord, trouve {len(nord)} : {nord}"
    assert abs(nord[0]["longueur_m"] - 42.18) < 0.1


def test_u_shape_concave_contour():
    """Contour en U (cour en renfoncement) : les 3 murs a l'interieur du
    renfoncement doivent etre orientes correctement -- c'etait le bug
    original (inversion a 180 deg sur contour concave, methode centre de
    masse non fiable)."""
    u = [(0, 0), (0, 10), (4, 10), (4, 4), (6, 4), (6, 10), (10, 10), (10, 0), (0, 0)]
    assert outward_ok(u)


if __name__ == "__main__":
    tests = [
        test_normals_point_outside,
        test_direction_of_travel_irrelevant,
        test_direction_of_travel_irrelevant_contre_exemple_fige,
        test_patio_hole_oriented_inward,
        test_u_shape_concave_contour,
        test_buffon_facade_nord_reference,
    ]
    failures = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except Skipped as ex:
            print(f"SKIP {t.__name__}: {ex}")
        except Exception as ex:
            failures += 1
            print(f"FAIL {t.__name__}: {ex!r}")
    sys.exit(1 if failures else 0)
