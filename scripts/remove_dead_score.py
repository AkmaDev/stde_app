"""
Retire le champ `score` (risque/urgence/faisabilite/sct) herite de l'ancien
systeme de scoring, jamais lu par aucun composant (verifie par grep) --
remplace par le calcul en direct (scoreRisque/scoreUrgence/scoreFaisabilite/
prioriteGlobale dans lib/api.ts). Touche uniquement data/batiment/{id}.json
et data/batiments.json (les seuls endroits ou cette cle existe).

Usage : python remove_dead_score.py
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"


def main():
    for path in sorted((DATA_DIR / "batiment").glob("*.json")):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if "score" in data:
            del data["score"]
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            print(f"{path.name} : score retire")

    batiments_path = DATA_DIR / "batiments.json"
    with open(batiments_path, encoding="utf-8") as f:
        liste = json.load(f)
    n = 0
    for item in liste:
        if "score" in item:
            del item["score"]
            n += 1
    with open(batiments_path, "w", encoding="utf-8") as f:
        json.dump(liste, f, ensure_ascii=False, separators=(",", ":"))
    print(f"batiments.json : score retire sur {n} entrees")


if __name__ == "__main__":
    main()
