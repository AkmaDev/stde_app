import json, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_APUR_DIR = os.path.join(SCRIPT_DIR, "raw", "apur")
FRONTEND_DATA_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "batiment")

proposed = json.load(open(os.path.join(SCRIPT_DIR, "manual_selection_proposed.json"), encoding="utf-8"))

for bid, sel in proposed.items():
    b = json.load(open(os.path.join(FRONTEND_DATA_DIR, f"{bid}.json"), encoding="utf-8"))["batiment"]
    apur = json.load(open(os.path.join(RAW_APUR_DIR, f"{bid}.json"), encoding="utf-8"))
    feat = next(f for f in apur["features"] if f["attributes"]["OBJECTID"] == sel["apur_objectid"])
    a = feat["attributes"]
    print(f"{bid:>3} {b['nom']:<22} etages={str(b.get('nombre_etages')):<4} surface_connue={str(b.get('surface_m2')):<7} "
          f"apur_surface={a['Shape_Area']:.0f} h_moy={a['h_moy']:.1f} h_min={a['h_min']:.1f} h_max={a['h_max']:.1f}")
