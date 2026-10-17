"""
Genere scripts/DIFF_FACADES_PUBLIEES.md : pour chaque batiment deja publie
(frontend/data/batiment/{id}.json) avec une sortie fraiche (out/{id}_enrichment.json),
liste les facades PORTEUSES DE DONNEES (taux de vitrage, note de vitrage ou
irradiance) et ou apparier_facades_par_geometrie() les retrouve -- point 4
de la definition de "termine" du CLAUDE.md : ce diff doit exister avant
toute fusion dans frontend/data/ (la numerotation des facades change d'une
republication APUR a l'autre, voir cle_geo).

Lecture seule : n'ecrit jamais dans frontend/data/ ni manual_selection.json.

Usage : python diff_facades_publiees.py
"""
import json
import os

from enrich_rnb_apur import (
    FRONTEND_DATA_DIR,
    MANUAL_SELECTION_PATH,
    OUT_DIR,
    apparier_facades_par_geometrie,
    reconstruire_positions_anciennes,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_MD_PATH = os.path.join(SCRIPT_DIR, "DIFF_FACADES_PUBLIEES.md")


def facade_porteuse(seg):
    return not seg.get("bruit") and (
        seg.get("taux_vitrage_estime_pct") is not None
        or seg.get("vitrage_note")
        or seg.get("irradiance_kwh_m2_an") is not None
    )


def resume_donnee(seg):
    note = (seg.get("vitrage_note") or "").strip()
    if note:
        return note[:60] + ("..." if len(note) > 60 else "")
    if seg.get("taux_vitrage_estime_pct") is not None:
        return f"vitrage={seg['taux_vitrage_estime_pct']}%"
    return f"irradiance={seg.get('irradiance_kwh_m2_an')} kWh/m2/an"


def main():
    with open(MANUAL_SELECTION_PATH, encoding="utf-8") as f:
        selection = json.load(f)

    lignes = [
        "# Diff facades publiees vs sortie fraiche du pipeline",
        "",
        "Genere par `diff_facades_publiees.py` -- AUCUNE fusion n'a ete faite, ce fichier",
        "sert de reference avant d'en faire une. La numerotation des facades change d'une",
        "republication APUR a l'autre (`normalize()`) -- ne jamais fusionner par egalite",
        "d'index, toujours via `apparier_facades_par_geometrie()`.",
        "",
    ]
    total_porteuses = 0
    total_non_appariees = 0

    for bid_str in sorted(selection.keys(), key=int):
        bid = int(bid_str)
        old_path = os.path.join(FRONTEND_DATA_DIR, f"{bid}.json")
        out_path = os.path.join(OUT_DIR, f"{bid}_enrichment.json")
        if not (os.path.exists(old_path) and os.path.exists(out_path)):
            continue
        with open(old_path, encoding="utf-8") as f:
            old = json.load(f)["batiment"]["facade_segments"]
        with open(out_path, encoding="utf-8") as f:
            new = json.load(f)["facade_segments"]

        porteuses = [s for s in old if facade_porteuse(s)]
        if not porteuses:
            continue

        rings = selection.get(bid_str, {}).get("apur_rings")
        old_pos = reconstruire_positions_anciennes(old, rings) if rings else old
        paires, non_apparies = apparier_facades_par_geometrie(old_pos, new)
        par_index = {a["index"]: n["index"] for a, n in paires}
        non_app_idx = {a["index"] for a in non_apparies}

        lignes.append(f"## Batiment {bid} ({len(porteuses)} facade(s) porteuse(s))")
        lignes.append("")
        lignes.append("| Ancien index | Nouvel index | Donnee |")
        lignes.append("|---|---|---|")
        for s in porteuses:
            total_porteuses += 1
            cible = par_index.get(s["index"])
            if cible is None:
                total_non_appariees += 1
                cible_txt = "**NON APPARIEE**"
            else:
                cible_txt = str(cible)
            lignes.append(f"| {s['index']} | {cible_txt} | {resume_donnee(s)} |")
        lignes.append("")

    lignes.insert(6, "")
    lignes.insert(7, f"**Total : {total_porteuses} facade(s) porteuse(s) de donnees, "
                      f"{total_non_appariees} non appariee(s).**")
    lignes.insert(8, "")

    with open(OUT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes) + "\n")
    print(f"{OUT_MD_PATH} genere : {total_porteuses} facade(s) porteuse(s), "
          f"{total_non_appariees} non appariee(s).")


if __name__ == "__main__":
    main()
