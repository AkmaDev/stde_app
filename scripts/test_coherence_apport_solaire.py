"""
Tests de coherence sur le pipeline d'apport solaire (irradiance_pvgis.py),
d'apres la checklist section 21 de la note technique de Jean
(sdte_jean/Methode calcul apport solaire.pdf).

Lecture seule -- ne modifie aucune donnee, ne fait aucun appel reseau (tout
est deja en cache dans raw/pvgis/ suite aux executions precedentes de
irradiance_pvgis.py).

Usage :
  python test_coherence_apport_solaire.py
"""

import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from irradiance_pvgis import azimut_to_pvgis_aspect  # reutilise la formule deja en prod, pas de redefinition

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, "raw", "pvgis")
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "batiment")

T_MIN_PLAUSIBLE = -25.0
T_MAX_PLAUSIBLE = 45.0

failures = []
passed = 0


def check(label, condition, detail=""):
    global passed
    if condition:
        passed += 1
    else:
        failures.append(f"{label}" + (f" -- {detail}" if detail else ""))


def hour_of_day(time_str):
    # Format PVGIS: "20190101:0010" -> heure = 0
    return int(time_str.split(":")[1][:2])


def main():
    raw_files = sorted(glob.glob(os.path.join(RAW_DIR, "*.json")))
    if not raw_files:
        print(f"Aucun fichier trouve dans {RAW_DIR} -- rien a tester.")
        sys.exit(1)

    print(f"=== {len(raw_files)} fichiers PVGIS caches trouves ===\n")

    for path in raw_files:
        fname = os.path.basename(path)
        m = re.match(r"^([\-0-9.]+)_([\-0-9.]+)_([\-0-9.]+)\.json$", fname)
        if not m:
            check(f"nom de fichier reconnu ({fname})", False, "format inattendu, ignore")
            continue
        lat, lon, aspect = float(m.group(1)), float(m.group(2)), float(m.group(3))

        data = json.load(open(path, encoding="utf-8"))
        hourly = data["outputs"]["hourly"]
        check(f"[{fname}] 8760 lignes horaires", len(hourly) in (8760, 8784), f"trouve {len(hourly)}")

        # Test 1 -- nuit : H_sun <= 0 => G(i) == 0
        nuit_violations = [h for h in hourly if h["H_sun"] <= 0 and h["G(i)"] != 0]
        check(f"[{fname}] test nuit (H_sun<=0 => G(i)=0)", len(nuit_violations) == 0,
              f"{len(nuit_violations)} heures de nuit avec G(i)!=0")

        # Test 2 -- pas de valeurs aberrantes
        negatives = [h for h in hourly if h["G(i)"] < 0]
        check(f"[{fname}] aucune irradiance negative", len(negatives) == 0, f"{len(negatives)} valeurs G(i)<0")

        temps_hors_plage = [h for h in hourly if not (T_MIN_PLAUSIBLE <= h["T2m"] <= T_MAX_PLAUSIBLE)]
        check(f"[{fname}] temperatures plausibles ({T_MIN_PLAUSIBLE} a {T_MAX_PLAUSIBLE} degC)",
              len(temps_hors_plage) == 0, f"{len(temps_hors_plage)} valeurs hors plage")

        # Test 3 -- orientation : facade Ouest (aspect ~ +90) => pic l'apres-midi
        # facade Est (aspect ~ -90) => pic le matin. Heure moyenne ponderee par G(i).
        total_g = sum(h["G(i)"] for h in hourly)
        if total_g > 0:
            heure_moyenne = sum(hour_of_day(h["time"]) * h["G(i)"] for h in hourly) / total_g
            if 70 <= aspect <= 110:
                check(f"[{fname}] orientation Ouest -> pic apres-midi (heure moy.={heure_moyenne:.1f}h UTC)",
                      heure_moyenne > 12.0)
            elif -110 <= aspect <= -70:
                check(f"[{fname}] orientation Est -> pic matin (heure moy.={heure_moyenne:.1f}h UTC)",
                      heure_moyenne < 12.0)
            # Sud/Nord : pas de test directionnel simple (symetrique autour de midi)

        # Test 4 -- coherence des agregats : Sigma G(i)/1000 recalcule vs irradiance_kwh_m2_an stocke
        total_kwh_recalcule = round(total_g / 1000, 1)
        cache_key = f"{round(lat, 4)}_{round(lon, 4)}_{round(aspect, 1)}"
        trouve_en_prod = False
        for bpath in glob.glob(os.path.join(DATA_DIR, "*.json")):
            b = json.load(open(bpath, encoding="utf-8"))["batiment"]
            if b.get("latitude") is None:
                continue
            if round(b["latitude"], 4) != round(lat, 4) or round(b["longitude"], 4) != round(lon, 4):
                continue
            for seg in b.get("facade_segments", []):
                if seg.get("bruit"):
                    continue
                seg_aspect = azimut_to_pvgis_aspect(seg["azimut_deg"])
                if round(seg_aspect, 1) == round(aspect, 1):
                    trouve_en_prod = True
                    stocke = seg.get("irradiance_kwh_m2_an")
                    if stocke is not None:
                        ecart_pct = abs(stocke - total_kwh_recalcule) / total_kwh_recalcule * 100
                        check(
                            f"[{fname}] agrege recalcule ({total_kwh_recalcule} kWh/m2/an) "
                            f"vs stocke ({stocke}, batiment {b['id']} segment {seg['index']})",
                            ecart_pct < 1.0,
                            f"ecart {ecart_pct:.2f}%",
                        )
        if not trouve_en_prod:
            print(f"  (info) [{fname}] aucun segment de facade en prod ne correspond a ce cache -- test 4 non applicable")

    # Test 5 -- taux de vitrage entre 0 et 100
    for bpath in sorted(glob.glob(os.path.join(DATA_DIR, "*.json"))):
        b = json.load(open(bpath, encoding="utf-8"))["batiment"]
        if not b.get("rnb_verifie"):
            continue
        for seg in b.get("facade_segments", []):
            tv = seg.get("taux_vitrage_estime_pct")
            if tv is not None:
                check(
                    f"[batiment {b['id']} segment {seg['index']}] taux de vitrage plausible ({tv}%)",
                    0 <= tv <= 100,
                )

    print(f"\n=== RESULTAT : {passed} tests reussis, {len(failures)} echecs ===")
    if failures:
        print("\nEchecs :")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("Tous les tests de coherence passent.")
        sys.exit(0)


if __name__ == "__main__":
    main()
