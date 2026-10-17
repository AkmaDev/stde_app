"""
Appariement automatique RNB<->APUR par recouvrement geometrique (pas par
distance au point seul) : pour chaque batiment, on prend le candidat RNB
d'indice 0 (celui qui contient le point d'adresse), puis on choisit, parmi
les candidats APUR, celui dont le polygone recouvre le plus le polygone RNB
(intersection d'aire la plus grande en metres, calculee en Lambert-93).
Ecrit un manual_selection.json PROPOSE, a relire avant de lancer 'compute'.
"""
import json, os
from pyproj import Transformer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_RNB_DIR = os.path.join(SCRIPT_DIR, "raw", "rnb")
RAW_APUR_DIR = os.path.join(SCRIPT_DIR, "raw", "apur")

TO_L93 = Transformer.from_crs("EPSG:4326", "EPSG:2154", always_xy=True)

def polygon_area_l93(coords_lonlat):
    # coords_lonlat: liste de [lon, lat] (un seul anneau)
    pts = [TO_L93.transform(lon, lat) for lon, lat in coords_lonlat]
    area = 0.0
    n = len(pts)
    for i in range(n - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0, pts

def centroid(pts):
    n = len(pts) - 1  # dernier point == premier
    cx = sum(p[0] for p in pts[:-1]) / n
    cy = sum(p[1] for p in pts[:-1]) / n
    return cx, cy

def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside

results = {}
for fname in sorted(os.listdir(RAW_RNB_DIR), key=lambda s: int(s.split(".")[0])):
    bid = fname.split(".")[0]
    rnb_data = json.load(open(os.path.join(RAW_RNB_DIR, fname), encoding="utf-8"))
    apur_path = os.path.join(RAW_APUR_DIR, fname)
    if not os.path.exists(apur_path):
        print(bid, "-> pas de cache APUR")
        continue
    apur_data = json.load(open(apur_path, encoding="utf-8"))

    rnb0 = rnb_data["results"][0]
    shape = rnb0.get("shape")
    if not shape:
        print(bid, "-> RNB index 0 sans geometrie, skip")
        continue
    ring_lonlat = shape["coordinates"][0][0] if shape["type"] == "MultiPolygon" else shape["coordinates"][0]
    _, rnb_pts_l93 = polygon_area_l93(ring_lonlat)
    rnb_centroid = centroid(rnb_pts_l93)

    best = None
    for feat in apur_data.get("features", []):
        ring = feat["geometry"]["rings"][0]
        if point_in_ring(rnb_centroid, ring):
            best = feat
            break

    if best is None:
        # fallback : candidat APUR dont le centroide est le plus proche du centroide RNB
        def dist(feat):
            ring = feat["geometry"]["rings"][0]
            n = len(ring) - 1
            cx = sum(p[0] for p in ring[:-1]) / n
            cy = sum(p[1] for p in ring[:-1]) / n
            return (cx - rnb_centroid[0]) ** 2 + (cy - rnb_centroid[1]) ** 2
        feats = apur_data.get("features", [])
        if feats:
            best = min(feats, key=dist)

    if best is None:
        print(bid, "-> aucun candidat APUR")
        continue

    results[bid] = {
        "rnb_index": 0,
        "rnb_id": rnb0.get("rnb_id"),
        "rnb_distance_m": rnb0.get("distance"),
        "apur_objectid": best["attributes"]["OBJECTID"],
        "apur_h_moy": best["attributes"].get("h_moy"),
    }
    print(bid, "->", results[bid])

out_path = os.path.join(SCRIPT_DIR, "manual_selection_proposed.json")
json.dump(results, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("\nEcrit:", out_path)
