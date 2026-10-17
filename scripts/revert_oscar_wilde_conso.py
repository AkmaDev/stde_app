"""
Oscar Wilde : le 10,8 kWh/m2 utilise jusqu'ici comme "conso mesuree" ne
compte que l'electricite (seule energie presente dans consommations_mensuelles,
42 mois, ratio=1). Le vrai DPE 2010 du batiment (trouve par l'utilisateur)
confirme un chauffage au Gaz, jamais facture dans le fichier source -- donc
10,8 ne represente pas la vraie consommation totale. Remis en "hypothese"
et retire des agregats du parc (conso_mesuree_kwh_m2 = null), plutot que de
laisser un chiffre partiel se faire passer pour un total.

Usage : python revert_oscar_wilde_conso.py
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"
OSCAR_WILDE_ID = 7

NOTE = (
    "Electricite seule disponible (42 mois de factures, ratio=1) -- aucune "
    "ligne Gaz ou Vapeur dans le fichier source. Le DPE 2010 de ce batiment "
    "confirme pourtant un chauffage au Gaz (« Source de production de "
    "chaleur : GAZ », chaufferie non accessible lors de la visite). Les "
    "10,8 kWh/m2 an precedemment affiches comme conso mesuree ne "
    "representaient donc que la part electrique, pas la consommation "
    "totale du batiment -- retire des agregats du parc jusqu'a obtention "
    "d'une facture gaz."
)


def patch_batiment(b):
    b["conso_mesuree_kwh_m2"] = None
    b["conso_origine"] = "hypothese"
    b["annee_mesure"] = None
    b["energie_principale"] = "Gaz"
    b["conso_incertitude"] = NOTE


def main():
    detail_path = DATA_DIR / "batiment" / f"{OSCAR_WILDE_ID}.json"
    with open(detail_path, encoding="utf-8") as f:
        data = json.load(f)
    patch_batiment(data["batiment"])
    with open(detail_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    canonique = data["batiment"]
    print(f"batiment/{OSCAR_WILDE_ID}.json corrige")

    batiments_path = DATA_DIR / "batiments.json"
    with open(batiments_path, encoding="utf-8") as f:
        liste = json.load(f)
    for item in liste:
        if item["batiment"].get("id") == OSCAR_WILDE_ID:
            item["batiment"] = dict(canonique)
    with open(batiments_path, "w", encoding="utf-8") as f:
        json.dump(liste, f, ensure_ascii=False, separators=(",", ":"))
    print("batiments.json resynchronise")

    for i in range(1, 7):
        levier_path = DATA_DIR / "levier" / f"{i}.json"
        if not levier_path.exists():
            continue
        with open(levier_path, encoding="utf-8") as f:
            d = json.load(f)
        for entry in d.get("batiments", []):
            if entry.get("batiment", {}).get("id") == OSCAR_WILDE_ID:
                entry["batiment"] = dict(canonique)
        with open(levier_path, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print("levier/*.json resynchronises")

    indicateurs_path = DATA_DIR / "indicateurs.json"
    with open(indicateurs_path, encoding="utf-8") as f:
        d = json.load(f)
    avant = len(d["classement_ecart_objectif"])
    d["classement_ecart_objectif"] = [
        e for e in d["classement_ecart_objectif"] if e["batiment"].get("id") != OSCAR_WILDE_ID
    ]
    apres = len(d["classement_ecart_objectif"])

    pairs = []
    gaps = []
    for e in d["classement_ecart_objectif"]:
        b = e["batiment"]
        c, s = b.get("conso_mesuree_kwh_m2"), b.get("surface_m2")
        if c is not None and s:
            pairs.append((c, s))
            gaps.append((e["ecart_kwh_m2"], s))

    tot_surf = sum(s for _, s in pairs)
    d["conso_moyenne_ponderee_kwh_m2"] = round(sum(c * s for c, s in pairs) / tot_surf, 1)
    tot_surf_gap = sum(s for _, s in gaps)
    d["ecart_moyen_objectif_2030_kwh_m2"] = round(sum(g * s for g, s in gaps) / tot_surf_gap, 1)
    d["nb_batiments_documentes"] = apres

    with open(indicateurs_path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print(
        f"indicateurs.json : classement {avant} -> {apres} entrees, "
        f"conso_moyenne_ponderee_kwh_m2={d['conso_moyenne_ponderee_kwh_m2']}, "
        f"ecart_moyen_objectif_2030_kwh_m2={d['ecart_moyen_objectif_2030_kwh_m2']}, "
        f"nb_batiments_documentes={d['nb_batiments_documentes']}"
    )


if __name__ == "__main__":
    main()
