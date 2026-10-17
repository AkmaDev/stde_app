"""
Remplit retroactivement le champ "apur_rings" (empreinte geometrique brute,
anneaux en Lambert-93) dans manual_selection.json, pour les entrees qui n'en
ont pas encore -- a partir du cache APUR actuel (raw/apur/{id}.json),
en retrouvant le candidat par apur_objectid.

Sans ce champ, verifie_identite_batiment() (enrich_rnb_apur.py) ne peut pas
utiliser le garde-fou geometrique (recouvrement >=95%, bien plus fiable
qu'une comparaison de hauteur seule) et retombe toujours sur l'ancien
garde-fou par hauteur. Verifie le 2026-10-17 : apur_rings n'existait dans
aucune des 9 entrees de manual_selection.json (0 occurrence).

Ne traite PAS Jean-Pierre Melville (id 16) : son apur_objectid est deja
introuvable dans le cache actuel -- impossible de retrouver sa geometrie par
ce moyen. Reste a reparer manuellement une premiere fois (ouvrir
raw/review/16.geojson), ou en executant 'compute' qui tentera une recherche
par recouvrement si un autre backfill (ex. une empreinte historique) devient
disponible.

Usage : python backfill_apur_rings.py
"""
import json
import os

from enrich_rnb_apur import MANUAL_SELECTION_PATH, RAW_APUR_DIR


def main():
    with open(MANUAL_SELECTION_PATH, encoding="utf-8") as f:
        selection = json.load(f)

    modifies = 0
    ignores = []

    for bid_str, choice in selection.items():
        if "apur_rings" in choice:
            print(f"{bid_str} : apur_rings deja present, ignore.")
            continue

        apur_path = os.path.join(RAW_APUR_DIR, f"{bid_str}.json")
        if not os.path.exists(apur_path):
            print(f"{bid_str} : pas de cache APUR ({apur_path}), ignore.")
            ignores.append(bid_str)
            continue

        with open(apur_path, encoding="utf-8") as f:
            apur_data = json.load(f)

        apur_cand = next(
            (feat for feat in apur_data.get("features", []) if feat["attributes"]["OBJECTID"] == choice["apur_objectid"]),
            None,
        )
        if apur_cand is None:
            print(
                f"{bid_str} : apur_objectid={choice['apur_objectid']} introuvable dans le cache actuel "
                f"-- impossible de backfill depuis cette source, ignore (a reparer manuellement)."
            )
            ignores.append(bid_str)
            continue

        choice["apur_rings"] = apur_cand["geometry"]["rings"]
        modifies += 1
        print(f"{bid_str} : apur_rings ajoute ({len(choice['apur_rings'])} anneau(x)).")

    if modifies:
        with open(MANUAL_SELECTION_PATH, "w", encoding="utf-8") as f:
            json.dump(selection, f, ensure_ascii=False, indent=2)
        print(f"\n{MANUAL_SELECTION_PATH} mis a jour : {modifies} entree(s) completee(s).")
    if ignores:
        print(f"\nNon traites (voir details ci-dessus) : {', '.join(ignores)}")


if __name__ == "__main__":
    main()
