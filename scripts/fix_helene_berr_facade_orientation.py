"""
Corrige l'inversion a 180 degres de la facade index 18 d'Helene Berr.

Bug source : polygon_to_facades() (enrich_rnb_apur.py) determinait la
normale exterieure d'un mur par distance a un centre moyen des sommets du
contour -- methode non fiable sur un contour concave, ou le "dehors" local
d'un segment peut etre tourne vers ce centre. Corrige dans enrich_rnb_apur.py
(methode aire signee / sens de parcours), mais la donnee deja publiee pour
Helene Berr reste fausse tant qu'elle n'est pas repatchee ici.

Verification independante avant correction (voir conversation) :
- Les 2 autres facades Est du meme batiment (index 0 et 17, meme azimut
  ~53-55 deg que le 18 une fois corrige a 180 deg pres, donc tres probablement
  le meme pan de mur) ont une irradiance_corrigee de 384.7 et 390.4 kWh/m2/an
  -- tres proche du resultat recalcule ici pour le segment 18 (386.5), ce qui
  confirme l'hypothese par coherence interne.
- Nouvelle irradiance recalculee directement via l'API PVGIS (meme methode et
  parametres que irradiance_pvgis.py / masques_solaires.py, azimut PVGIS
  144.6 deg = notre azimut boussole 324.6 deg = orientation N) :
  irradiance_kwh_m2_an=422.3, irradiance_corrigee_kwh_m2_an=386.5 (avec le
  meme horizon de masques solaires deja mis en cache pour ce batiment,
  raw/apur_voisins/9.json).

Ne touche a aucune autre donnee du segment (longueur_m, vitrage, etc.) ni des
autres segments du batiment.

Usage : python fix_helene_berr_facade_orientation.py
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"
HELENE_BERR_ID = 9
SEGMENT_INDEX = 18

NOUVELLE_ORIENTATION = "N"
NOUVEL_AZIMUT_DEG = 324.6  # (144.6 + 180) % 360 -- inversion exacte du bug
NOUVELLE_IRRADIANCE_BRUTE = 422.3
NOUVELLE_IRRADIANCE_CORRIGEE = 386.5


def patch_batiment(b):
    seg = next(s for s in b["facade_segments"] if s["index"] == SEGMENT_INDEX)
    assert seg["orientation"] == "S" and seg["bruit"] is False, (
        "Le segment 18 ne correspond plus a ce qui etait attendu -- "
        "verifier avant de reappliquer ce patch."
    )
    seg["orientation"] = NOUVELLE_ORIENTATION
    seg["azimut_deg"] = NOUVEL_AZIMUT_DEG
    seg["irradiance_kwh_m2_an"] = NOUVELLE_IRRADIANCE_BRUTE
    seg["irradiance_corrigee_kwh_m2_an"] = NOUVELLE_IRRADIANCE_CORRIGEE


def main():
    detail_path = DATA_DIR / "batiment" / f"{HELENE_BERR_ID}.json"
    with open(detail_path, encoding="utf-8") as f:
        data = json.load(f)
    patch_batiment(data["batiment"])
    with open(detail_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    canonique = data["batiment"]
    print(f"batiment/{HELENE_BERR_ID}.json corrige : segment {SEGMENT_INDEX} S->N")

    batiments_path = DATA_DIR / "batiments.json"
    with open(batiments_path, encoding="utf-8") as f:
        liste = json.load(f)
    for item in liste:
        if item["batiment"].get("id") == HELENE_BERR_ID:
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
        touched = False
        for entry in d.get("batiments", []):
            if entry.get("batiment", {}).get("id") == HELENE_BERR_ID:
                entry["batiment"] = dict(canonique)
                touched = True
        if touched:
            with open(levier_path, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print("levier/*.json resynchronises")


if __name__ == "__main__":
    main()
