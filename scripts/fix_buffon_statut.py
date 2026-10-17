"""
Corrige l'intitulé patrimonial de Buffon : "Site classé (ABF - covisibilité)"
melangeait deux regimes juridiques distincts (site classe = Code de
l'environnement ; abords de monument historique/covisibilite = Code du
patrimoine). La justification deja documentee dans caracFields.ts (proximite
du Jardin des Plantes, monument historique) releve du second regime, pas du
premier -- nouvel intitule aligne sur cette justification reelle, toujours
marque "a confirmer" (cf. lib/caracFields.ts, fiab Faible).

Usage : python fix_buffon_statut.py
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"
ANCIEN = "Site classé (ABF — covisibilité)"
NOUVEAU = "Abords de monument historique (covisibilité ABF)"


def patch(obj):
    if obj.get("statut_patrimonial") == ANCIEN:
        obj["statut_patrimonial"] = NOUVEAU
        return True
    return False


def main():
    detail_path = DATA_DIR / "batiment" / "2.json"
    with open(detail_path, encoding="utf-8") as f:
        data = json.load(f)
    if patch(data["batiment"]):
        with open(detail_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print("batiment/2.json : statut_patrimonial corrige")

    batiments_path = DATA_DIR / "batiments.json"
    with open(batiments_path, encoding="utf-8") as f:
        liste = json.load(f)
    n = sum(1 for item in liste if patch(item["batiment"]))
    with open(batiments_path, "w", encoding="utf-8") as f:
        json.dump(liste, f, ensure_ascii=False, separators=(",", ":"))
    print(f"batiments.json : {n} entree(s) corrigee(s)")

    for i in range(1, 7):
        levier_path = DATA_DIR / "levier" / f"{i}.json"
        if not levier_path.exists():
            continue
        with open(levier_path, encoding="utf-8") as f:
            d = json.load(f)
        n = sum(1 for entry in d.get("batiments", []) if patch(entry["batiment"]))
        with open(levier_path, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
        if n:
            print(f"levier/{i}.json : {n} entree(s) corrigee(s)")

    indicateurs_path = DATA_DIR / "indicateurs.json"
    with open(indicateurs_path, encoding="utf-8") as f:
        d = json.load(f)
    n = sum(1 for entry in d.get("classement_ecart_objectif", []) if patch(entry["batiment"]))
    with open(indicateurs_path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    if n:
        print(f"indicateurs.json : {n} entree(s) corrigee(s)")


if __name__ == "__main__":
    main()
