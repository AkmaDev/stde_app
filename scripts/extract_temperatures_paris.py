"""
Extrait les temperatures journalieres de Paris-Montsouris (Meteo-France,
donnees climatologiques de base quotidiennes, data.gouv.fr) et ecrit, par
mois, la temperature moyenne et les degres-jours dans
frontend/data/meteo_paris_montsouris.json.

Sert l'onglet "Trajectoire" (graphe du tableau blanc de Jean : temperature
exterieure + chauffage + leviers).

Regles d'honnetete :
- Tm journaliere = TNTXM (moyenne (TN+TX)/2 fournie par Meteo-France) ;
  si TNTXM est absent mais TN et TX presents, (TN+TX)/2 recalcule.
- Un jour sans temperature n'est PAS comble : il est compte dans
  `jours_manquants` du mois, et les degres-jours du mois ne portent que sur
  les jours mesures. Un mois incomplet est donc signale, jamais extrapole.
- Un mois sans aucun jour mesure n'est pas ecrit.
- Fichier introuvable, colonne absente ou station absente -> arret avec
  une erreur explicite (code 1), aucune sortie partielle.

Degres-jours (methode Meteo-France, base 18 degC) :
- DJU chauffage = somme de max(0, 18 - Tm)
- DJC climatisation = somme de max(0, Tm - 18)

Usage : python extract_temperatures_paris.py
"""
import csv
import gzip
import io
import json
import sys
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path
import calendar

BASE_URL = "https://object.files.data.gouv.fr/meteofrance/data/synchro_ftp/BASE/QUOT/"
FICHIERS = [
    "Q_75_previous-1950-2024_RR-T-Vent.csv.gz",
    "Q_75_latest-2025-2026_RR-T-Vent.csv.gz",
]
PAGE_JEU_DE_DONNEES = "https://www.data.gouv.fr/fr/datasets/donnees-climatologiques-de-base-quotidiennes/"
POSTE = "75114001"  # PARIS-MONTSOURIS
NOM_POSTE = "PARIS-MONTSOURIS"
DEBUT = "2023-01"  # premier mois des factures (extract_consommation_mensuelle.py)
FIN = "2026-06"    # dernier mois des factures
BASE_DJ = 18.0

SORTIE = Path(__file__).resolve().parents[1] / "frontend" / "data" / "meteo_paris_montsouris.json"


def erreur(msg: str) -> None:
    print(f"ERREUR : {msg}", file=sys.stderr)
    sys.exit(1)


def telecharger(nom: str) -> str:
    url = BASE_URL + nom
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            brut = r.read()
    except Exception as e:  # noqa: BLE001 -- on veut un message clair, pas une trace
        erreur(f"telechargement impossible de {url} ({e})")
    try:
        return gzip.decompress(brut).decode("utf-8")
    except Exception as e:  # noqa: BLE001
        erreur(f"fichier {nom} illisible (gzip/utf-8) : {e}")


def flottant(v: str):
    v = (v or "").strip()
    if v == "":
        return None
    try:
        return float(v)
    except ValueError:
        erreur(f"valeur numerique invalide : {v!r}")


def main() -> None:
    tm_par_jour: dict[str, float] = {}
    for nom in FICHIERS:
        texte = telecharger(nom)
        lecteur = csv.DictReader(io.StringIO(texte), delimiter=";")
        for col in ("NUM_POSTE", "AAAAMMJJ", "TN", "TX", "TNTXM"):
            if col not in (lecteur.fieldnames or []):
                erreur(f"colonne {col} absente de {nom} (format change ?)")
        for ligne in lecteur:
            if ligne["NUM_POSTE"].strip() != POSTE:
                continue
            j = ligne["AAAAMMJJ"].strip()
            jour = f"{j[0:4]}-{j[4:6]}-{j[6:8]}"
            if not (DEBUT <= jour[:7] <= FIN):
                continue
            tm = flottant(ligne["TNTXM"])
            if tm is None:
                tn, tx = flottant(ligne["TN"]), flottant(ligne["TX"])
                if tn is not None and tx is not None:
                    tm = (tn + tx) / 2
            if tm is None:
                continue
            if jour in tm_par_jour and abs(tm_par_jour[jour] - tm) > 1e-9:
                erreur(f"jour {jour} present deux fois avec des valeurs differentes")
            tm_par_jour[jour] = tm

    if not tm_par_jour:
        erreur(f"aucune donnee pour la station {POSTE} entre {DEBUT} et {FIN}")

    par_mois: dict[str, list[float]] = defaultdict(list)
    for jour, tm in tm_par_jour.items():
        par_mois[jour[:7]].append(tm)

    mois_sortie = []
    y, m = int(DEBUT[:4]), int(DEBUT[5:])
    while f"{y:04d}-{m:02d}" <= FIN:
        cle = f"{y:04d}-{m:02d}"
        valeurs = par_mois.get(cle, [])
        nb_jours = calendar.monthrange(y, m)[1]
        if valeurs:
            mois_sortie.append({
                "mois": cle,
                "tm": round(sum(valeurs) / len(valeurs), 2),
                "dju18": round(sum(max(0.0, BASE_DJ - t) for t in valeurs), 1),
                "djc18": round(sum(max(0.0, t - BASE_DJ) for t in valeurs), 1),
                "jours_mesures": len(valeurs),
                "jours_manquants": nb_jours - len(valeurs),
            })
        m += 1
        if m == 13:
            y, m = y + 1, 1

    incomplets = [x["mois"] for x in mois_sortie if x["jours_manquants"] > 0]
    sortie = {
        "source": {
            "producteur": "Meteo-France",
            "jeu_de_donnees": "Donnees climatologiques de base - quotidiennes",
            "page": PAGE_JEU_DE_DONNEES,
            "fichiers": [BASE_URL + f for f in FICHIERS],
            "station": f"{NOM_POSTE} ({POSTE})",
            "date_extraction": date.today().isoformat(),
            "methode": "Tm = TNTXM ((TN+TX)/2). DJU = somme max(0, 18 - Tm) ; DJC = somme max(0, Tm - 18). Jours manquants non combles.",
        },
        "mois": mois_sortie,
    }
    SORTIE.write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(mois_sortie)} mois ecrits dans {SORTIE}")
    if incomplets:
        print(f"Mois incomplets (jours manquants, non combles) : {', '.join(incomplets)}")


if __name__ == "__main__":
    main()
