"""
Calcule l'irradiance solaire annuelle (kWh/m2/an) recue par chaque facade
reelle des batiments deja qualifies geometriquement (hauteur + facades via
RNB/APUR), via l'API PVGIS (Commission europeenne, gratuite, sans cle).

Sans correction par les masques solaires (ombres des batiments voisins) --
chantier separe, voir NOTES_COURBES_HELIOTROPIQUES.md.

Usage :
  python irradiance_pvgis.py

Sortie : un fichier par batiment scripts/out_irradiance/{id}.json,
{"<index_segment>": irradiance_kwh_m2_an, ...} -- a fusionner ensuite a la
main dans frontend/data/batiment/{id}.json (jamais d'ecriture directe ici).
"""

import json
import os
import time

import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "batiment")
RAW_DIR = os.path.join(SCRIPT_DIR, "raw", "pvgis")
OUT_DIR = os.path.join(SCRIPT_DIR, "out_irradiance")

PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_2/seriescalc"

# Les 8 batiments deja qualifies geometriquement (rnb_verifie=true)
QUALIFIED_IDS = [2, 7, 9, 11, 12, 13, 16, 18]


def azimut_to_pvgis_aspect(azimut_deg):
    """Notre azimut (boussole, 0=Nord, 90=Est) -> convention PVGIS
    (0=Sud, 90=Ouest, -90=Est). Verifie sur Buffon cette session."""
    return ((azimut_deg - 180 + 180) % 360) - 180


def fetch_irradiance(lat, lon, aspect_pvgis):
    cache_key = f"{round(lat, 4)}_{round(lon, 4)}_{round(aspect_pvgis, 1)}"
    cache_path = os.path.join(RAW_DIR, f"{cache_key}.json")
    if os.path.exists(cache_path):
        data = json.load(open(cache_path, encoding="utf-8"))
    else:
        params = {
            "lat": lat,
            "lon": lon,
            "angle": 90,
            "aspect": aspect_pvgis,
            "pvcalculation": 0,
            "outputformat": "json",
            "startyear": 2019,
            "endyear": 2019,
        }
        for attempt in range(4):
            try:
                r = requests.get(PVGIS_URL, params=params, headers={"User-Agent": "sdte-irradiance/1.0"}, timeout=60)
                r.raise_for_status()
                data = r.json()
                break
            except requests.exceptions.RequestException as e:
                if attempt == 3:
                    raise
                print(f"    (retry {attempt+1}/3 apres erreur reseau: {e})")
                time.sleep(3)
        json.dump(data, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
        time.sleep(1)  # API publique, pas de cle -- on reste courtois

    total_wh = sum(h["G(i)"] for h in data["outputs"]["hourly"])
    return round(total_wh / 1000, 1)  # Wh -> kWh


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    for bid in QUALIFIED_IDS:
        path = os.path.join(DATA_DIR, f"{bid}.json")
        b = json.load(open(path, encoding="utf-8"))["batiment"]
        lat, lon = b["latitude"], b["longitude"]
        print(f"\n=== {bid} — {b['nom']} ===")

        result = {}
        for seg in b["facade_segments"]:
            if seg["bruit"]:
                continue
            aspect = azimut_to_pvgis_aspect(seg["azimut_deg"])
            irr = fetch_irradiance(lat, lon, aspect)
            result[str(seg["index"])] = irr
            print(f"  segment {seg['index']:>2} ({seg['orientation']}, azimut={seg['azimut_deg']}°) "
                  f"-> aspect_pvgis={aspect:.1f}° -> {irr} kWh/m²/an")

        out_path = os.path.join(OUT_DIR, f"{bid}.json")
        json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"  -> {out_path}")


if __name__ == "__main__":
    main()
