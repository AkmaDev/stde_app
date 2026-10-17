"""
Extrait la consommation mensuelle reelle (electricite, gaz/vapeur) depuis le
fichier fourni par l'equipe de Jean Rolland et patche chaque
data/batiment/{id}.json (+ copies embarquees dans batiments.json et
data/levier/*.json) avec un nouveau champ `consommations_mensuelles`.

Regles d'honnetete (actees en session) :
- un mois absent du fichier source n'est PAS ecrit (pas de null, pas de 0
  invente) -> traite comme un vrai trou de facture cote app.
- les valeurs negatives (anomalies de regularisation de compteur, 2 cas
  connus : Duras Electricite 2025-03, Oscar Wilde Electricite 2026-03) sont
  neutralisees -> non ecrites, pas de fausse valeur.
- doublons (bug source connu : meme (batiment, fluide, mois) en double,
  motif [0, valeur_reelle]) -> on garde le max.

Usage : python extract_consommation_mensuelle.py
"""
import json
import unicodedata
from collections import defaultdict
from pathlib import Path

import openpyxl

EXCEL_PATH = Path(r"C:\Users\manew\Downloads\Bibliothèques - Etude DAC - Consommations Janvier 2023 - Juin 2026 (1).xlsx")
DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"

# Nom (tel qu'ecrit dans l'Excel, normalise) -> id numerique de l'app
NOMS_VERS_ID = {
    "BIBLIOTHEQUE-DISCOTHEQUE MUNICIPALE BUFFON": 2,
    "BIBLIOTHEQUE-DISCOTHEQUE MUNICIPALE OSCAR WILDE": 7,
    "MEDIATHEQUE HELENE BERR": 9,
    "BIBLIOTHEQUE-DISCOTHEQUE MUNICIPALE FRANCOIS VILLON": 11,
    "BIBLIOTHEQUE MUNICIPALE GUTENBERG": 12,
    "BIBLIOTHEQUE COLETTE VIVIER": 13,
    "BIBLIOTHEQUE MUNICIPALE TONI MORRISON": 14,
    "BIBLIOTHEQUE MUNICIPALE CLAUDE LEVI-STRAUSS": 15,
    "BIBLIOTHEQUE-DISCOTHEQUE-VIDEOTHEQUE MUNICIPALE JEAN-PIERRE MELVILLE": 16,
    "BIBLIOTHEQUE MEDIATHEQUE MARGUERITE DURAS": 17,
    "BIBLIOTHEQUE MOHAMMED ARKOUN": 18,
}


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).upper()


def norm_fluide(f):
    if not f:
        return f
    if "lectricit" in f:
        return "Électricité"
    if "vapeur" in f.lower():
        return "Vapeur"
    if "gaz" in f.lower():
        return "Gaz"
    return f


def matched_id(nom_excel):
    key = norm(nom_excel)
    for k, v in NOMS_VERS_ID.items():
        kk = norm(k)
        if kk in key or key in kk:
            return v
    return None


def extract():
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    ws = wb["Base"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    # dedup (batiment_id, fluide, mois) -> valeur max
    dedup = {}
    for r in rows:
        _ident, _typ, nom, _ratio, fluide, _pdl, date, conso = r
        bid = matched_id(nom)
        if bid is None:
            continue
        fl = norm_fluide(fluide)
        ym = str(date)[:7]
        key = (bid, fl, ym)
        if conso is None:
            continue
        if key not in dedup or conso > dedup[key]:
            dedup[key] = conso

    # neutralise les negatifs, regroupe par batiment
    par_batiment = defaultdict(list)
    neutralises = []
    for (bid, fl, ym), conso in dedup.items():
        if conso < 0:
            neutralises.append((bid, fl, ym, conso))
            continue
        par_batiment[bid].append({"mois": ym, "energie": fl, "kwh": round(conso, 2)})

    for bid in par_batiment:
        par_batiment[bid].sort(key=lambda e: (e["mois"], e["energie"]))

    print(f"Valeurs negatives neutralisees (non ecrites) : {neutralises}")
    return par_batiment


def patch_batiment_obj(batiment_obj, mensuelles):
    batiment_obj["consommations_mensuelles"] = mensuelles


def patch_file(path, bid, mensuelles, get_batiment_objs):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    objs = get_batiment_objs(data, bid)
    if not objs:
        return False
    for obj in objs:
        patch_batiment_obj(obj, mensuelles)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return True


def main():
    par_batiment = extract()

    for bid, mensuelles in par_batiment.items():
        # 1) fichier detail data/batiment/{id}.json : { batiment, score, leviers }
        detail_path = DATA_DIR / "batiment" / f"{bid}.json"
        patch_file(
            detail_path,
            bid,
            mensuelles,
            lambda data, _bid: [data["batiment"]] if data.get("batiment", {}).get("id") == _bid else [],
        )
        print(f"id={bid}: {detail_path.name} patche ({len(mensuelles)} points)")

    # 2) data/batiments.json : liste [{batiment, score}]
    batiments_path = DATA_DIR / "batiments.json"

    def get_objs_liste(data, bid):
        return [item["batiment"] for item in data if item.get("batiment", {}).get("id") == bid]

    with open(batiments_path, encoding="utf-8") as f:
        liste = json.load(f)
    n = 0
    for item in liste:
        b = item.get("batiment", {})
        if b.get("id") in par_batiment:
            patch_batiment_obj(b, par_batiment[b["id"]])
            n += 1
    with open(batiments_path, "w", encoding="utf-8") as f:
        json.dump(liste, f, ensure_ascii=False, separators=(",", ":"))
    print(f"batiments.json patche ({n} batiments)")

    # 3) data/levier/{1..6}.json : { levier, batiments: [{batiment, ...}] }
    for i in range(1, 7):
        levier_path = DATA_DIR / "levier" / f"{i}.json"
        if not levier_path.exists():
            continue
        with open(levier_path, encoding="utf-8") as f:
            data = json.load(f)
        n = 0
        for entry in data.get("batiments", []):
            b = entry.get("batiment", {})
            if b.get("id") in par_batiment:
                patch_batiment_obj(b, par_batiment[b["id"]])
                n += 1
        with open(levier_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"levier/{i}.json patche ({n} batiments)")

    # 4) data/indicateurs.json : classement_ecart_objectif embarque aussi des
    # objets `batiment` complets (repere apres coup, pas dans l'exploration
    # initiale du plan -- pas de champ `batiment` a la racine du fichier mais
    # bien un dans ce sous-tableau).
    indicateurs_path = DATA_DIR / "indicateurs.json"
    if indicateurs_path.exists():
        with open(indicateurs_path, encoding="utf-8") as f:
            data = json.load(f)
        n = 0
        for entry in data.get("classement_ecart_objectif", []):
            b = entry.get("batiment", {})
            if b.get("id") in par_batiment:
                patch_batiment_obj(b, par_batiment[b["id"]])
                n += 1
        with open(indicateurs_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"indicateurs.json patche ({n} batiments dans classement_ecart_objectif)")


if __name__ == "__main__":
    main()
