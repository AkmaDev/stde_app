"""
Geocodage valide, avec garde-fou explicite -- a lancer AVANT enrich_rnb_apur.py
sur tout nouveau lot de batiments, jamais apres.

Pourquoi ce script existe (trouve en session le 03/09/2026) : la Base Adresse
Nationale (BAN, utilisee par a peu pres tout geocodeur francais gratuit --
y compris le geocodeur officiel de Geoportail lui-meme, teste et confirme
identique) a de vrais trous sur les adresses secondaires ("bis"/"ter"). Sur
un cas reel (Toni Morrison, "20 bis avenue Parmentier"), la recherche
retombe silencieusement sur le centre de la rue entiere (score bas, type
"street") au lieu du batiment -- une coordonnee fausse qui serait entree
dans l'app sans etre remarquee si rien ne la detecte.

Regle : ne jamais accepter automatiquement un resultat qui n'est pas de
type "housenumber" avec un score suffisant. Un cas rejete doit etre
verifie a la main (Geoportail + cadastre, en cherchant visuellement le
bon numero) -- ce script ne pretend pas eliminer cette etape humaine,
seulement la rendre visible et systematique au lieu de silencieuse.

Usage :
  python geocode_adresses.py            # mode audit sur les 11 batiments actuels
"""
import json
import math
import time
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"
RAW_DIR = Path(__file__).resolve().parent / "raw"
BAN_URL = "https://api-adresse.data.gouv.fr/search/?q={}&limit=1"

SCORE_MIN = 0.8  # observe cette session : bonnes correspondances a 0.98, repli rue a 0.6-0.73


def geocoder_adresse(adresse: str) -> dict:
    """Renvoie {lat, lon, label, score, type, fiable}. fiable=False (ou
    resultats vides) -> ne jamais ecrire cette coordonnee automatiquement."""
    url = BAN_URL.format(quote(adresse))
    # A l'echelle de 165 batiments, des 504/timeouts transitoires de la BAN
    # sont attendus -- pas une raison de perdre tout l'audit en cours.
    for tentative in range(3):
        try:
            with urlopen(url, timeout=15) as r:
                data = json.load(r)
            break
        except Exception as e:
            if tentative == 2:
                raise
            time.sleep(2 * (tentative + 1))
    feats = data.get("features", [])
    if not feats:
        return {"lat": None, "lon": None, "label": None, "score": 0.0, "type": None, "fiable": False}
    p = feats[0]["properties"]
    lon, lat = feats[0]["geometry"]["coordinates"]
    type_ = p.get("type")
    score = p.get("score", 0.0)
    fiable = type_ == "housenumber" and score >= SCORE_MIN
    return {"lat": lat, "lon": lon, "label": p.get("label"), "score": round(score, 3), "type": type_, "fiable": fiable}


def distance_m(lat1, lon1, lat2, lon2):
    dx = (lon2 - lon1) * 111320 * math.cos(math.radians((lat1 + lat2) / 2))
    dy = (lat2 - lat1) * 111320
    return math.hypot(dx, dy)


def audit():
    rapport = []
    for f in sorted((DATA_DIR / "batiment").glob("*.json"), key=lambda p: int(p.stem)):
        d = json.loads(f.read_text(encoding="utf-8"))
        b = d["batiment"]
        adresse = b.get("adresse")
        if not adresse:
            continue
        g = geocoder_adresse(adresse)
        stocke_lat, stocke_lon = b.get("latitude"), b.get("longitude")
        ecart = None
        if g["lat"] is not None and stocke_lat is not None:
            ecart = round(distance_m(stocke_lat, stocke_lon, g["lat"], g["lon"]), 1)
        ligne = {
            "id": b["id"],
            "nom": b["nom"],
            "adresse": adresse,
            "stocke": [stocke_lat, stocke_lon],
            "ban": [g["lat"], g["lon"]],
            "ban_label": g["label"],
            "ban_score": g["score"],
            "ban_type": g["type"],
            "fiable": g["fiable"],
            "ecart_m": ecart,
        }
        rapport.append(ligne)
        flag = "OK" if g["fiable"] else "A VERIFIER MANUELLEMENT"
        print(f"[{flag}] id={b['id']:<3} {b['nom']:<22} score={g['score']:<5} type={g['type']:<12} ecart={ecart}m")

    RAW_DIR.mkdir(exist_ok=True)
    out_path = RAW_DIR / "geocodage_rapport.json"
    out_path.write_text(json.dumps(rapport, ensure_ascii=False, indent=1), encoding="utf-8")
    non_fiables = [r for r in rapport if not r["fiable"]]
    print(f"\n{len(rapport)} batiments audites, {len(non_fiables)} non fiable(s) -> {out_path}")
    if non_fiables:
        print("A verifier a la main (Geoportail + cadastre) avant tout usage de leur geometrie :")
        for r in non_fiables:
            print(f"  - id={r['id']} {r['nom']} ({r['adresse']})")


if __name__ == "__main__":
    audit()
