"""
Corrige l'irradiance solaire de chaque facade en tenant compte des ombres
portees par les batiments voisins (masques solaires), via le parametre
PVGIS `userhorizon` (24 valeurs, une tous les 15 deg, azimut 0=Nord sens
horaire -- verifie en direct cette session : identique a notre convention
azimut_deg, aucune conversion necessaire).

Simplifications assumees (voir plan) :
- Point d'observation de l'horizon = centroide du batiment, pas chaque
  facade individuellement.
- Hauteur de reference pour l'angle d'obstruction = sol (z=0), pas la
  hauteur reelle de chaque etage -- approximation conservatrice.

Usage : python masques_solaires.py
Sortie : scripts/out_masques/{id}.json = {"horizon_deg": [...24 valeurs...],
"irradiance_corrigee": {"<index_segment>": kwh_m2_an, ...}}
A fusionner ensuite a la main dans frontend/data/batiment/{id}.json.
"""

import json
import math
import os
import time

import requests
from pyproj import Transformer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "batiment")
RAW_VOISINS_DIR = os.path.join(SCRIPT_DIR, "raw", "apur_voisins")
RAW_PVGIS_DIR = os.path.join(SCRIPT_DIR, "raw", "pvgis_masques")
OUT_DIR = os.path.join(SCRIPT_DIR, "out_masques")

APUR_URL = "https://carto2.apur.org/apur/rest/services/OPENDATA/EMPRISE_BATIE_PARIS/MapServer/0/query"
PVGIS_URL = "https://re.jrc.ec.europa.eu/api/v5_2/seriescalc"

VOISINS_RADIUS_DEG = 0.001  # ~100m a la latitude de Paris
NB_SECTEURS = 24  # 360/24 = 15 deg par secteur, convention PVGIS

TO_L93 = Transformer.from_crs("EPSG:4326", "EPSG:2154", always_xy=True)

QUALIFIED_IDS = [2, 7, 9, 11, 12, 13, 16, 18]


def azimut_to_pvgis_aspect(azimut_deg):
    """Meme formule que irradiance_pvgis.py : notre azimut boussole
    (0=Nord, 90=Est) -> convention PVGIS aspect (0=Sud, 90=Ouest, -90=Est)."""
    return ((azimut_deg - 180 + 180) % 360) - 180


def fetch_voisins(bid, lat, lon):
    cache_path = os.path.join(RAW_VOISINS_DIR, f"{bid}.json")
    if os.path.exists(cache_path):
        return json.load(open(cache_path, encoding="utf-8"))
    d = VOISINS_RADIUS_DEG
    params = {
        "geometry": f"{lon-d},{lat-d},{lon+d},{lat+d}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "f": "json",
    }
    r = requests.get(APUR_URL, params=params, headers={"User-Agent": "sdte-masques/1.0"}, timeout=30)
    r.raise_for_status()
    data = r.json()
    json.dump(data, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
    return data


def polygon_centroid_l93(ring_xy_l93):
    # Les polygones APUR sont deja en Lambert-93 (metres) -- pas de
    # reprojection ici, seulement la moyenne des sommets (contrairement au
    # point GPS du batiment lui-meme, qui lui est en WGS84 et doit etre
    # converti via TO_L93 avant comparaison).
    n = len(ring_xy_l93) - 1  # dernier point == premier
    cx = sum(p[0] for p in ring_xy_l93[:-1]) / n
    cy = sum(p[1] for p in ring_xy_l93[:-1]) / n
    return cx, cy


def build_horizon(bid, lat, lon, apur_data, own_objectid):
    """Retourne un tableau de 24 angles d'obstruction max (deg), un par
    secteur de 15 deg (azimut 0=Nord, sens horaire)."""
    own_lon, own_lat = lon, lat
    own_x, own_y = TO_L93.transform(own_lon, own_lat)

    horizon = [0.0] * NB_SECTEURS

    for feat in apur_data.get("features", []):
        attrs = feat["attributes"]
        if attrs.get("OBJECTID") == own_objectid:
            continue  # exclut le batiment lui-meme
        h_voisin = attrs.get("h_max")  # h_max = le plus contraignant (conservateur)
        if h_voisin is None or h_voisin <= 0:
            continue
        ring = feat["geometry"]["rings"][0]
        cx, cy = polygon_centroid_l93(ring)
        dx, dy = cx - own_x, cy - own_y
        distance = math.hypot(dx, dy)
        if distance < 1:
            continue  # evite division par ~0 (chevauchement/meme batiment non exclu par id)
        angle_obstruction = math.degrees(math.atan2(h_voisin, distance))
        azimut = math.degrees(math.atan2(dx, dy)) % 360  # 0=Nord, 90=Est -- coherent avec userhorizon
        secteur = int(azimut // (360 / NB_SECTEURS)) % NB_SECTEURS
        horizon[secteur] = max(horizon[secteur], angle_obstruction)

    return [round(h, 1) for h in horizon]


def fetch_irradiance_corrigee(lat, lon, aspect_pvgis, horizon):
    cache_key = f"{round(lat,4)}_{round(lon,4)}_{round(aspect_pvgis,1)}_{'_'.join(str(h) for h in horizon)}"
    cache_path = os.path.join(RAW_PVGIS_DIR, f"{hash(cache_key) & 0xffffffff}.json")
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
            "userhorizon": ",".join(str(h) for h in horizon),
        }
        for attempt in range(4):
            try:
                r = requests.get(PVGIS_URL, params=params, headers={"User-Agent": "sdte-masques/1.0"}, timeout=60)
                r.raise_for_status()
                data = r.json()
                break
            except requests.exceptions.RequestException as e:
                if attempt == 3:
                    raise
                print(f"    (retry {attempt+1}/3 apres erreur reseau: {e})")
                time.sleep(3)
        json.dump(data, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
        time.sleep(1)

    total_wh = sum(h["G(i)"] for h in data["outputs"]["hourly"])
    return round(total_wh / 1000, 1)


def main():
    os.makedirs(RAW_VOISINS_DIR, exist_ok=True)
    os.makedirs(RAW_PVGIS_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    for bid in QUALIFIED_IDS:
        path = os.path.join(DATA_DIR, f"{bid}.json")
        b = json.load(open(path, encoding="utf-8"))["batiment"]
        lat, lon = b["latitude"], b["longitude"]
        print(f"\n=== {bid} — {b['nom']} ===")

        apur_data = fetch_voisins(bid, lat, lon)
        # Le batiment lui-meme = le feature le plus proche du point (comme
        # dans enrich_rnb_apur.py / auto_match.py) ; on cherche son OBJECTID
        # parmi les features pour l'exclure de ses propres voisins.
        own_objectid = None
        best_dist = None
        for feat in apur_data.get("features", []):
            ring = feat["geometry"]["rings"][0]
            cx, cy = polygon_centroid_l93(ring)
            own_x, own_y = TO_L93.transform(lon, lat)
            d = math.hypot(cx - own_x, cy - own_y)
            if best_dist is None or d < best_dist:
                best_dist, own_objectid = d, feat["attributes"]["OBJECTID"]

        horizon = build_horizon(bid, lat, lon, apur_data, own_objectid)
        print(f"  horizon (24 secteurs, 0=N sens horaire): {horizon}")
        print(f"  {len(apur_data.get('features', []))} batiments dans la zone, batiment propre exclu (objectid={own_objectid})")

        result = {}
        for seg in b["facade_segments"]:
            if seg["bruit"]:
                continue
            aspect = azimut_to_pvgis_aspect(seg["azimut_deg"])
            irr_corrigee = fetch_irradiance_corrigee(lat, lon, aspect, horizon)
            irr_brute = seg.get("irradiance_kwh_m2_an")
            result[str(seg["index"])] = irr_corrigee
            delta = f" (brute={irr_brute}, delta={round(irr_brute - irr_corrigee, 1)})" if irr_brute is not None else ""
            print(f"  segment {seg['index']:>2} ({seg['orientation']}) -> corrigee={irr_corrigee} kWh/m²/an{delta}")

        out_path = os.path.join(OUT_DIR, f"{bid}.json")
        json.dump({"horizon_deg": horizon, "irradiance_corrigee": result}, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"  -> {out_path}")


if __name__ == "__main__":
    main()
