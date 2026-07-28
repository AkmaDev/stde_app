"""Squelette du "moteur d'analyse" statistique (pas de moteur de calcul thermique physique,
decision actee en reunion du 24/07 - voir email Alice Bore). Les seuils et poids ci-dessous
sont des references documentees/demo en attendant les ~20 jeux de donnees avant/apres
necessaires pour calibrer ce moteur sur des cas reels.
"""

from dataclasses import dataclass
from functools import reduce

from app.models import Batiment

OBJECTIF_2030_KWH_M2 = 128  # reference Decret Tertiaire, coherent avec doc 09 (-40% vs 1974)

DPE_RISQUE = {"A": 10, "B": 25, "C": 40, "D": 55, "E": 70, "F": 85, "G": 100}


@dataclass
class ScoreResult:
    risque: float
    urgence: float
    faisabilite: float
    sct: float


def calculer_score(batiment: Batiment) -> ScoreResult:
    risque = _score_risque(batiment)
    urgence = _score_urgence(batiment)
    faisabilite = _score_faisabilite(batiment)
    sct = risque * 0.5 + urgence * 0.3 + faisabilite * 0.2
    return ScoreResult(risque=risque, urgence=urgence, faisabilite=faisabilite, sct=round(sct, 1))


def _score_risque(batiment: Batiment) -> float:
    dpe_score = DPE_RISQUE.get((batiment.dpe or "D").upper(), 55)
    if batiment.conso_mesuree_kwh_m2:
        ecart_pct = (batiment.conso_mesuree_kwh_m2 - OBJECTIF_2030_KWH_M2) / OBJECTIF_2030_KWH_M2 * 100
        ecart_score = max(0, min(100, 50 + ecart_pct))
    else:
        ecart_score = dpe_score
    return round((dpe_score + ecart_score) / 2, 1)


def _score_urgence(batiment: Batiment) -> float:
    # Proxy simplifie : une orientation ouest/sud-ouest est la plus critique (cf. doc 09,
    # section physique orientation/vitrage). Pas de donnee "confort ressenti" ni "derniere
    # date de travaux" disponible pour l'instant dans le socle de demo.
    orientation = (batiment.orientation_vitrage_dominante or "").lower()
    if "ouest" in orientation:
        return 80.0
    if "est" in orientation:
        return 55.0
    if "sud" in orientation:
        return 40.0
    return 20.0


def _score_faisabilite(batiment: Batiment) -> float:
    # Un statut patrimonial contraignant reduit la faisabilite technique (ABF, MH...).
    # Proximite reseau CPCU non disponible dans le socle de demo actuel -> non prise en compte.
    statut = (batiment.statut_patrimonial or "").lower()
    if "aucune" in statut or statut == "":
        return 90.0
    if "plu" in statut:
        return 70.0
    if "inscrit" in statut:
        return 45.0
    if "classe" in statut or "classé" in statut:
        return 25.0
    return 60.0


def ecreter_gains_combines(gains_pct: list[float]) -> float:
    """Combine plusieurs gains de leviers (en %) sans les additionner naivement.

    Rappel de l'email Alice Bore du 24/07 : x% de gain vitrage + y% de gain isolation
    ne fait PAS (x+y)% si on fait les deux. On applique un ecretement multiplicatif
    sur les parts economisees restantes (equivalent a des gains qui s'appliquent sur
    ce qui reste a economiser, pas sur la conso totale a chaque fois) :

        gain_total = 1 - produit(1 - gain_i)

    Approximation documentee, a recalibrer des que des jeux de donnees avant/apres
    reels seront disponibles pour verifier sa pertinence (cf. email : "il est essentiel
    de travailler sur l'etude de ce moteur d'analyse en amont pour verifier sa
    pertinence").
    """
    if not gains_pct:
        return 0.0
    facteurs_restants = [1 - (g / 100) for g in gains_pct]
    gain_total = 1 - reduce(lambda a, b: a * b, facteurs_restants, 1.0)
    return round(gain_total * 100, 1)
