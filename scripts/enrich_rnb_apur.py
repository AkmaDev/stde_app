"""
Enrichit les 11 batiments reels SDTE avec hauteur, facades et adresses
verifiees, a partir du RNB (Referentiel National des Batiments) et de
l'APUR (Emprise batie Paris) -- sources gratuites, sans cle.

Voir le plan : C:\\Users\\manew\\.claude\\plans\\joyful-giggling-crystal.md
et NOTES_COURBES_HELIOTROPIQUES.md pour le contexte complet.

Usage (deux passes) :
  1) python enrich_rnb_apur.py fetch
     -> interroge RNB + APUR pour les 11 batiments, met en cache les
        reponses brutes (raw/rnb, raw/apur), genere un GeoJSON de revue
        par batiment (raw/review/{id}.geojson) + un resume texte a l'ecran.
     -> ouvrir les GeoJSON dans geojson.io (ou equivalent) pour identifier
        visuellement le bon segment/polygone parmi les candidats, puis
        remplir manual_selection.json a la main.
  2) python enrich_rnb_apur.py compute
     -> pour chaque batiment present dans manual_selection.json, calcule
        hauteur / adresses / segments de facade et ecrit out/{id}_enrichment.json.
     -> ces fichiers sont ensuite fusionnes A LA MAIN dans
        frontend/data/batiment/{id}.json (jamais en ecriture directe ici).
"""

import json
import math
import os
import sys
import time

import requests
from pyproj import Transformer
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient as shapely_orient
from shapely.validation import make_valid

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DATA_DIR = os.path.join(SCRIPT_DIR, "..", "frontend", "data", "batiment")
RAW_RNB_DIR = os.path.join(SCRIPT_DIR, "raw", "rnb")
RAW_APUR_DIR = os.path.join(SCRIPT_DIR, "raw", "apur")
RAW_REVIEW_DIR = os.path.join(SCRIPT_DIR, "raw", "review")
OUT_DIR = os.path.join(SCRIPT_DIR, "out")
MANUAL_SELECTION_PATH = os.path.join(SCRIPT_DIR, "manual_selection.json")
MANUAL_SELECTION_PROPOSED_PATH = os.path.join(SCRIPT_DIR, "manual_selection_reparations_proposees.json")
# NOTE : un fichier "manual_selection_proposed.json" existait deja (26/08,
# anterieur a ce mecanisme -- semble etre une sauvegarde de l'etat original
# avant reparations, JPM y a encore l'ancien apur_objectid=36308). Nom
# different choisi expres pour ne jamais l'ecraser.

RNB_URL = "https://rnb-api.beta.gouv.fr/api/alpha/buildings/closest/"
APUR_URL = "https://carto2.apur.org/apur/rest/services/OPENDATA/EMPRISE_BATIE_PARIS/MapServer/0/query"

NOISE_THRESHOLD_M = 2.0  # segment plus court = jog/step d'emprise, pas une vraie facade
HAUTEUR_ETAGE_STD = 3.0  # hauteur d'etage standard utilisee pour l'estimation de controle
ECART_ETAGES_OK = 1.0    # ecart tolere sans justification (imprecision normale)
ECART_ETAGES_SUSPECT = 3.5  # au-dela de ce seuil (et sans note explicite dans
  # manual_selection.json), le batiment est marque 'suspect' -- le fichier de
  # sortie est tout de meme ecrit integralement (rien n'est rejete ni exclu
  # automatiquement), seul rnb_verifie passe a False pour signaler a la
  # fusion MANUELLE de ne pas reprendre ces donnees sans verification.
SIMPLIFY_TOLERANCE_M = 0.15  # tolerance de simplification Shapely (distance a
  # la droite, en metres) -- fusionne les points intermediaires d'un meme mur
  # digitalise en plusieurs segments (ex. Buffon, mur Nord de 42,18m qui
  # apparaissait en 4 segments de 12+4+15+11m avant migration). Remplace
  # l'ancienne fusion par angle (COLLINEAR_THRESHOLD_DEG), qui dependait du
  # point de depart du contour source (un meme mur pouvait donner 8 ou 9
  # facades selon le sens de parcours, confirme par tests aleatoires).
RECOUVREMENT_MIN = 0.95  # taux de recouvrement (IoU) minimal pour considerer
  # deux polygones APUR comme le meme batiment (verifie_identite_batiment()
  # et recherche_par_recouvrement()).

# Reprojection Lambert-93 (EPSG:2154, utilise par APUR) -> WGS84, pour les
# GeoJSON de revue uniquement (visualisation).
TO_WGS84 = Transformer.from_crs("EPSG:2154", "EPSG:4326", always_xy=True)

# Les 11 batiments reels du dossier NOTES_EXTRACTION_DOCUMENTS_REELS.md
# Les coordonnees ne sont plus codees en dur ici : un geocodage manuel fige
# dans ce fichier peut diverger silencieusement de la vraie adresse (cf. Toni
# Morrison, dont le point hardcode ici tombait a 523m de la bonne adresse,
# sur le centre de la rue plutot que sur le numero). La source unique de
# verite est desormais frontend/data/batiment/{id}.json.
BATIMENT_IDS = [2, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18]


def get_batiment_coords(bid):
    """Lit (nom, lat, lon) depuis le fichier de donnees du site -- jamais
    recopie a la main, pour eviter toute derive entre le script et le site."""
    data_path = os.path.join(FRONTEND_DATA_DIR, f"{bid}.json")
    if not os.path.exists(data_path):
        raise RuntimeError(
            f"batiment {bid} : {data_path} introuvable -- frontend/data/ est-il present "
            f"(clone propre du depot) ? (RuntimeError, pas un crash brut)"
        )
    with open(data_path, encoding="utf-8") as f:
        b = json.load(f)["batiment"]
    if b.get("latitude") is None or b.get("longitude") is None:
        raise RuntimeError(
            f"batiment {bid} ({b.get('nom')}) : latitude/longitude manquantes "
            f"dans {data_path} -- impossible de geocoder sans donnee source."
        )
    return b.get("nom"), b["latitude"], b["longitude"]


def ensure_dirs():
    for d in (RAW_RNB_DIR, RAW_APUR_DIR, RAW_REVIEW_DIR, OUT_DIR):
        os.makedirs(d, exist_ok=True)


def _validate_rnb_response(data):
    """Leve une exception si la reponse RNB (fraiche ou en cache) est
    invalide, au lieu de la laisser passer silencieusement."""
    if "error" in data:
        raise RuntimeError(f"RNB a renvoye une erreur : {data['error']}")
    if "results" not in data:
        raise RuntimeError("RNB : reponse sans cle 'results', format inattendu.")


def fetch_rnb(lat, lon):
    results = []
    params = {"point": f"{lat},{lon}", "radius": 50}
    url = RNB_URL
    page = 1
    while url:
        r = requests.get(url, params=params, headers={"User-Agent": "sdte-enrichment/1.0"}, timeout=20)
        r.raise_for_status()
        data = r.json()
        _validate_rnb_response(data)
        results.extend(data.get("results", []))
        url = data.get("next")
        params = None  # l'URL "next" contient deja tous les parametres
        page += 1
        if page > 20:  # garde-fou : jamais vu plus de 2 pages en pratique
            raise RuntimeError("RNB : pagination suspecte (>20 pages), arret de securite.")
    return {"results": results}


def fetch_apur(lat, lon):
    # Requete par petite enveloppe (~59x89m, pas "~40m" : 0.0004 degre vaut
    # ~44.5m en latitude mais seulement ~29.3m en longitude a Paris, a cause
    # de cos(48.85 deg) ~ 0.66) plutot que par point exact : un point geocode
    # a la main tombe parfois legerement a cote de l'emprise batie (cour,
    # trottoir), ce qui fait echouer une intersection ponctuelle stricte
    # alors que le batiment est bien present juste a cote.
    d = 0.0004
    params = {
        "geometry": f"{lon - d},{lat - d},{lon + d},{lat + d}",
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "outSR": "2154",  # explicite : tout le calcul suppose du Lambert-93
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "f": "json",
    }
    r = requests.get(APUR_URL, params=params, headers={"User-Agent": "sdte-enrichment/1.0"}, timeout=20)
    r.raise_for_status()
    data = r.json()
    _validate_apur_response(data, lat, lon)
    return data


def _validate_apur_response(data, lat, lon):
    """Leve une exception si la reponse APUR (fraiche ou en cache) est
    invalide, au lieu de la laisser passer silencieusement -- applique aussi
    bien a une reponse qui vient d'etre telechargee qu'a un cache existant
    (ecrit avant l'ajout de ces controles, ex. caches du 26/08 sans outSR)."""
    if "error" in data:
        raise RuntimeError(f"APUR a renvoye une erreur : {data['error']}")
    if data.get("exceededTransferLimit"):
        raise RuntimeError("APUR : exceededTransferLimit -- reponse tronquee, requete a affiner.")
    n = len(data.get("features", []))
    if n == 0:
        raise RuntimeError(f"APUR : 0 batiment trouve autour de ({lat},{lon}) -- geocodage probablement faux.")
    if n > 100:
        raise RuntimeError(
            f"APUR : {n} batiments trouves pour une enveloppe de ~59x89m -- "
            "nombre implausible, reponse probablement invalide (ex. geometrie mal formee)."
        )


def apur_ring_to_wgs84(ring):
    """Reprojette un anneau de polygone APUR (Lambert-93) en WGS84 [lon, lat]."""
    return [list(TO_WGS84.transform(x, y)) for x, y in ring]


def build_review_geojson(batiment_id, lat, lon, rnb_data, apur_data):
    features = [
        {
            "type": "Feature",
            "properties": {"role": "point_batiment"},
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        }
    ]

    for i, cand in enumerate(rnb_data.get("results", [])):
        shape = cand.get("shape")
        if not shape:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "role": "candidat_rnb",
                    "rnb_index": i,
                    "rnb_id": cand.get("rnb_id"),
                    "distance_m": cand.get("distance"),
                    "adresses": [
                        f"{a.get('street_number') or ''}{a.get('street_rep') or ''} {a.get('street')}"
                        for a in cand.get("addresses", [])
                    ],
                },
                "geometry": {"type": shape["type"], "coordinates": shape["coordinates"]},
            }
        )

    for feat in apur_data.get("features", []):
        rings_wgs84 = [apur_ring_to_wgs84(ring) for ring in feat["geometry"]["rings"]]
        attrs = feat["attributes"]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "role": "candidat_apur",
                    "apur_objectid": attrs.get("OBJECTID"),
                    "h_moy": attrs.get("h_moy"),
                    "h_min": attrs.get("h_min"),
                    "h_max": attrs.get("h_max"),
                },
                "geometry": {"type": "Polygon", "coordinates": rings_wgs84},
            }
        )

    return {"type": "FeatureCollection", "features": features, "batiment_id": batiment_id}


def cmd_fetch():
    ensure_dirs()
    for bid in BATIMENT_IDS:
        try:
            nom, lat, lon = get_batiment_coords(bid)
        except RuntimeError as e:
            print(f"\n=== {bid} ===\n  /!\\ ERREUR : {e}")
            continue
        print(f"\n=== {bid} — {nom} ===")

        rnb_path = os.path.join(RAW_RNB_DIR, f"{bid}.json")
        rnb_data = None
        if os.path.exists(rnb_path):
            with open(rnb_path, encoding="utf-8") as f:
                rnb_data = json.load(f)
            try:
                _validate_rnb_response(rnb_data)
                print("  RNB: cache existant (revalide)")
            except RuntimeError as e:
                print(f"  RNB: cache existant invalide ({e}) -- retelechargement")
                rnb_data = None
        if rnb_data is None:
            rnb_data = fetch_rnb(lat, lon)
            with open(rnb_path, "w", encoding="utf-8") as f:
                json.dump(rnb_data, f, ensure_ascii=False, indent=2)
            print(f"  RNB: {len(rnb_data.get('results', []))} candidat(s)")
            time.sleep(0.5)

        apur_path = os.path.join(RAW_APUR_DIR, f"{bid}.json")
        apur_data = None
        if os.path.exists(apur_path):
            with open(apur_path, encoding="utf-8") as f:
                apur_data = json.load(f)
            try:
                _validate_apur_response(apur_data, lat, lon)
                print("  APUR: cache existant (revalide)")
            except RuntimeError as e:
                print(f"  APUR: cache existant invalide ({e}) -- retelechargement")
                apur_data = None
        if apur_data is None:
            apur_data = fetch_apur(lat, lon)
            with open(apur_path, "w", encoding="utf-8") as f:
                json.dump(apur_data, f, ensure_ascii=False, indent=2)
            print(f"  APUR: {len(apur_data.get('features', []))} candidat(s)")
            time.sleep(0.5)

        for i, cand in enumerate(rnb_data.get("results", [])):
            addrs = ", ".join(
                f"{a.get('street_number') or ''}{a.get('street_rep') or ''} {a.get('street')}"
                for a in cand.get("addresses", [])
            )
            print(f"    rnb_index={i} rnb_id={cand.get('rnb_id')} dist={cand.get('distance'):.1f}m -> {addrs}")

        for feat in apur_data.get("features", []):
            a = feat["attributes"]
            h = f"{a['h_moy']:.1f}m" if a.get("h_moy") is not None else "None"
            surf = f"{a['Shape_Area']:.0f}m2" if a.get("Shape_Area") is not None else "None"
            print(f"    apur_objectid={a.get('OBJECTID')} h_moy={h} surface={surf}")

        review = build_review_geojson(bid, lat, lon, rnb_data, apur_data)
        review_path = os.path.join(RAW_REVIEW_DIR, f"{bid}.geojson")
        with open(review_path, "w", encoding="utf-8") as f:
            json.dump(review, f, ensure_ascii=False, indent=2)
        print(f"  -> revue: {review_path}")

    print(
        "\nProchaine etape : ouvrir chaque fichier raw/review/{id}.geojson dans "
        "geojson.io (ou QGIS) pour identifier le bon segment, puis remplir "
        f"{MANUAL_SELECTION_PATH}"
    )


def classify_orientation(azimut_deg):
    a = azimut_deg % 360
    if a >= 315 or a < 45:
        return "N"
    if a < 135:
        return "E"
    if a < 225:
        return "S"
    return "O"


def _signed_area(ring_xy_meters):
    """Aire signee (formule du lacet / shoelace). Positive = sens antihoraire,
    negative = sens horaire. Utilisee pour deduire le sens de parcours du
    contour, qui donne la normale exterieure de facon fiable meme sur un
    contour concave (cour en U, angle rentrant) -- contrairement a un test
    de distance a un centre moyen des sommets, qui se trompe des qu'un mur
    se trouve dans un renfoncement (le "dehors" local est alors tourne vers
    le centre).
    """
    n = len(ring_xy_meters)
    s = 0.0
    for i in range(n - 1):
        x1, y1 = ring_xy_meters[i]
        x2, y2 = ring_xy_meters[i + 1]
        s += x1 * y2 - x2 * y1
    return s / 2


def _coords_to_facades(coords, kind="exterieur", noise_threshold=NOISE_THRESHOLD_M):
    """coords: liste de (x,y) fermee (premier == dernier), DEJA orientee par
    shapely_orient(sign=1.0) -- le bati est alors toujours a GAUCHE du sens de
    parcours, pour un contour exterieur comme pour un trou (patio), donc la
    normale exterieure (vers le vide : rue pour un mur exterieur, cour pour un
    mur de patio) est toujours a DROITE. Une seule formule suffit pour les
    deux cas -- plus besoin du test par centre de masse (bug d'inversion sur
    contours concaves) ni d'un cas particulier pour les trous."""
    segments = []
    for i in range(len(coords) - 1):
        x1, y1 = coords[i]
        x2, y2 = coords[i + 1]
        dx, dy = x2 - x1, y2 - y1
        longueur = math.hypot(dx, dy)
        if longueur == 0:
            continue
        nx, ny = dy / longueur, -dx / longueur  # normale a droite du sens de parcours
        azimut = math.degrees(math.atan2(nx, ny)) % 360  # 0=Nord, 90=Est
        orientation = classify_orientation(azimut)
        mid_x, mid_y = (x1 + x2) / 2, (y1 + y2) / 2
        segments.append(
            {
                "anneau": kind,
                "longueur_m": round(longueur, 2),
                "orientation": orientation,
                "azimut_deg": round(azimut, 1),
                "bruit": longueur < noise_threshold,
                # Milieu du mur, Lambert-93 -- champs numeriques (pas
                # seulement arrondis dans cle_geo) pour un appariement tenant
                # compte de la position (voir apparier_facades_par_geometrie).
                "mid_x": round(mid_x, 2),
                "mid_y": round(mid_y, 2),
                # Cle geometrique stable (orientation + longueur arrondie au
                # decimetre + milieu du mur arrondi au metre, Lambert-93) --
                # contrairement a "index", elle survit a un changement de
                # point de depart/sens de parcours du contour source
                # (normalize() le change a chaque republication de l'emprise
                # APUR, constate sur Buffon : l'ancien index 0 devient le 2).
                # A utiliser pour rattacher vitrage_note/irradiance lors
                # d'une fusion dans frontend/data/, jamais par egalite
                # d'index -- voir apparier_facades_par_geometrie().
                "cle_geo": f"{orientation}|{round(longueur, 1)}|{round(mid_x)}|{round(mid_y)}",
            }
        )
    return segments


def _normalized_polygon(rings_xy_meters):
    """rings_xy_meters : liste d'anneaux (xy en metres, Lambert-93) -- le
    premier est le contour exterieur, les suivants des trous (patios).
    Valide, normalise (point de depart fixe, independant du contour source)
    et simplifie (fusion par distance plutot que par angle) via Shapely."""
    poly = Polygon(rings_xy_meters[0], rings_xy_meters[1:])
    if not poly.is_valid:
        poly = make_valid(poly)
        if poly.geom_type != "Polygon":
            raise ValueError(
                f"polygone invalide et non reparable en un seul Polygon (type apres "
                f"reparation : {poly.geom_type})"
            )
    poly = shapely_orient(poly.normalize(), sign=1.0)
    return poly.simplify(SIMPLIFY_TOLERANCE_M, preserve_topology=True)


def polygon_to_facades(ring_xy_meters):
    """ring_xy_meters : un seul anneau (xy en metres, Lambert-93), SANS trou.
    Conserve pour compatibilite avec la suite de tests existante
    (tests/test_props.py) qui teste cette fonction sur des formes synthetiques
    a un seul anneau. Pour un polygone avec patio/trous, utiliser
    polygon_with_holes_to_facades()."""
    poly = _normalized_polygon([ring_xy_meters])
    segments = _coords_to_facades(list(poly.exterior.coords))
    for i, s in enumerate(segments):
        s["index"] = i
    return segments


def polygon_with_holes_to_facades(rings_xy_meters):
    """rings_xy_meters : liste d'anneaux -- rings[0] = contour exterieur,
    rings[1:] = trous (patios, cours couvertes). Retourne les facades de TOUS
    les anneaux (exterieur + patios), correctement orientees dans les deux
    cas (voir _coords_to_facades)."""
    poly = _normalized_polygon(rings_xy_meters)
    segments = []
    anneaux = [("exterieur", poly.exterior)] + [("patio", r) for r in poly.interiors]
    for kind, ring in anneaux:
        segments.extend(_coords_to_facades(list(ring.coords), kind=kind))
    for i, s in enumerate(segments):
        s["index"] = i
    return segments


def reconstruire_positions_anciennes(anciens, apur_rings):
    """Estime mid_x/mid_y pour des facades deja publiees (frontend/data/,
    sans position stockee), a partir de apur_rings -- condition pour que le
    terme de position d'apparier_facades_par_geometrie() serve a quelque
    chose en pratique (sans lui, confirme sur Francois Villon : un ancien
    segment peut s'apparier a un mur a 3,7m du sien, longueur/azimut
    suffisant pour passer les tolerances mais pas la bonne position).

    APPROXIMATION, pas une position mesuree : reconstruit les aretes brutes
    (normalize(), sans simplify()) du contour source, et pour chaque ancien
    segment cherche la sous-sequence contigue d'aretes de meme orientation
    dont la longueur cumulee se rapproche le plus de longueur_m. A n'utiliser
    que pour departager un appariement approximatif, jamais comme verite
    terrain. Retourne une NOUVELLE liste (anciens non modifie).
    """
    poly = Polygon(apur_rings[0], apur_rings[1:])
    if not poly.is_valid:
        poly = make_valid(poly)
        if poly.geom_type != "Polygon":
            return list(anciens)
    poly = shapely_orient(poly.normalize(), sign=1.0)
    coords = list(poly.exterior.coords)

    aretes = []
    for i in range(len(coords) - 1):
        x1, y1 = coords[i]
        x2, y2 = coords[i + 1]
        dx, dy = x2 - x1, y2 - y1
        longueur = math.hypot(dx, dy)
        if longueur == 0:
            continue
        nx, ny = dy / longueur, -dx / longueur
        azimut = math.degrees(math.atan2(nx, ny)) % 360
        aretes.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2, "longueur": longueur,
                        "azimut": azimut, "orientation": classify_orientation(azimut)})

    resultat = []
    for ancien in anciens:
        # Sur une facade COURBE (ex. mur-rideau en verre de Jean-Pierre
        # Melville), plusieurs sequences d'aretes a des endroits differents
        # de la courbe peuvent sommer a une longueur quasi identique --
        # choisir seulement par longueur est alors ambigu (confirme : 9m
        # d'erreur sur un cas reel). On garde TOUS les candidats a moins de
        # 0.3m du meilleur, et on depart par l'azimut (le dernier azimut de
        # la courbe a cet endroit se rapproche de l'azimut du mur simplifie
        # d'origine) ; si meme l'azimut ne depart pas clairement, c'est
        # une vraie ambiguite -- aucune position n'est assignee plutot que
        # d'en deviner une.
        candidats = []
        for i in range(len(aretes)):
            if aretes[i]["orientation"] != ancien["orientation"]:
                continue
            cum = 0.0
            x_premier, y_premier = aretes[i]["x1"], aretes[i]["y1"]
            for j in range(i, len(aretes)):
                if aretes[j]["orientation"] != ancien["orientation"]:
                    break
                cum += aretes[j]["longueur"]
                diff = abs(cum - ancien["longueur_m"])
                # Milieu = (premier point + dernier point) / 2 -- PAS la
                # moyenne de tous les sommets intermediaires (ecart de
                # 8,93m mesure sur un cas reel avec aretes inegales : cette
                # moyenne pondere a tort chaque sommet partage selon le
                # nombre d'aretes qui s'y rejoignent).
                pos = ((x_premier + aretes[j]["x2"]) / 2, (y_premier + aretes[j]["y2"]) / 2)
                az_diff = _angle_diff(aretes[j]["azimut"], ancien["azimut_deg"])
                candidats.append((diff, az_diff, pos))

        nouveau = dict(ancien)
        if candidats:
            meilleur_diff = min(c[0] for c in candidats)
            # Fenetre etroite (5cm) : ne retient que les candidats dont la
            # longueur est quasiment aussi bonne que la meilleure -- une
            # fenetre plus large (ex. 0.3m) incluait a tort des candidats
            # nettement moins bons en longueur, qui l'emportaient ensuite
            # sur l'azimut alors qu'ils n'auraient jamais du concourir.
            proches = [c for c in candidats if c[0] - meilleur_diff <= 0.05]
            proches.sort(key=lambda c: c[1])  # depart par l'azimut
            # Ambigu si au moins 2 candidats restent proches en longueur ET
            # en azimut (meme cote de la courbe que le meilleur) : pas de
            # position plutot qu'une devinette.
            ambigu = len(proches) > 1 and (proches[1][1] - proches[0][1]) <= 5.0
            if not ambigu and meilleur_diff <= max(2.0, ancien["longueur_m"] * 0.5):
                nouveau["mid_x"] = round(proches[0][2][0], 2)
                nouveau["mid_y"] = round(proches[0][2][1], 2)
        resultat.append(nouveau)
    return resultat


def apparier_facades_par_geometrie(anciens, nouveaux, tolerance_longueur_m=1.5, tolerance_azimut_deg=15.0,
                                     tolerance_exacte_longueur_m=0.05, tolerance_exacte_azimut_deg=1.0,
                                     tolerance_position_m=3.0):
    """Apparie les segments d'une ancienne liste de facades (deja publiee dans
    frontend/data/batiment/{id}.json -- orientation/longueur_m/azimut_deg
    seulement, pas de milieu de mur, sauf si reconstruire_positions_anciennes()
    a ete appelee avant) avec ceux d'une nouvelle liste (fraichement calculee).
    A utiliser pour toute fusion, JAMAIS par egalite d'index : l'index change
    d'une republication a l'autre du contour source (voir cle_geo).

    Methode en 2 passes (une affectation gloutonne, dans l'ordre des index,
    peut voler a tort le partenaire exact d'un segment a un autre traite
    plus tot) :

    1. Correspondances EXACTES d'abord (tolerance_exacte_* tres stricte) :
       evite qu'un appariement approximatif pris trop tot ne vole le
       partenaire exact d'un autre segment.
    2. Affectation globale optimale (scipy.optimize.linear_sum_assignment,
       algorithme hongrois) sur le reste, par orientation -- minimise le cout
       total sur TOUS les appariements a la fois plutot que glouton segment
       par segment, donc insensible a l'ordre de traitement. Toute paire
       au-dela des tolerances (meme si c'est le meilleur score disponible)
       est rejetee plutot que forcee.

    Retourne (paires, anciens_non_apparies) ou paires est une liste de
    (ancien_segment, nouveau_segment) -- jamais de devinette au-dela des
    tolerances : un ancien segment sans correspondance plausible (ex. un mur
    que simplify() a decoupe en plusieurs nouveaux segments, pas de
    correspondance 1-pour-1) reste dans anciens_non_apparies, a traiter a la
    main plutot qu'a associer au hasard.
    """
    import numpy as np
    from scipy.optimize import linear_sum_assignment

    COUT_PROHIBITIF = 1e6  # hors tolerance -- jamais choisi par l'affectation

    def cout(a, n):
        dl = abs(n["longueur_m"] - a["longueur_m"])
        da = _angle_diff(n["azimut_deg"], a["azimut_deg"])
        if dl > tolerance_longueur_m or da > tolerance_azimut_deg:
            # Cout prohibitif AVANT l'affectation (pas un rejet apres coup) :
            # linear_sum_assignment optimise sur toute la matrice y compris
            # les paires hors tolerance, et peut sinon preferer une mauvaise
            # paire globale alors qu'une paire valide existe ailleurs.
            return COUT_PROHIBITIF
        c = dl + da / 10.0
        if "mid_x" in a and "mid_y" in a and "mid_x" in n and "mid_y" in n:
            d_pos = math.hypot(n["mid_x"] - a["mid_x"], n["mid_y"] - a["mid_y"])
            if d_pos > tolerance_position_m:
                # Meme longueur/azimut compatibles, mais mur clairement
                # different (ex. ancien Francois Villon n.2 : longueur et
                # azimut dans la tolerance, mais a 5m du nouveau candidat le
                # plus proche) -- sans ce rejet, le terme de position
                # n'influence que le classement parmi les candidats deja
                # tolerables, jamais leur exclusion.
                return COUT_PROHIBITIF
            c += d_pos / 10.0
        return c

    anciens_reels = [a for a in anciens if not a.get("bruit")]
    nouveaux_disponibles = list(nouveaux)
    paires = []

    # Passe 1 : correspondances exactes
    for ancien in list(anciens_reels):
        exact = next(
            (n for n in nouveaux_disponibles
             if n["orientation"] == ancien["orientation"]
             and abs(n["longueur_m"] - ancien["longueur_m"]) <= tolerance_exacte_longueur_m
             and _angle_diff(n["azimut_deg"], ancien["azimut_deg"]) <= tolerance_exacte_azimut_deg),
            None,
        )
        if exact is not None:
            paires.append((ancien, exact))
            anciens_reels.remove(ancien)
            nouveaux_disponibles.remove(exact)

    # Passe 2 : affectation globale (hongrois) par orientation, sur le reste
    non_apparies = []
    for orientation in ("N", "E", "S", "O"):
        a_grp = [a for a in anciens_reels if a["orientation"] == orientation]
        n_grp = [n for n in nouveaux_disponibles if n["orientation"] == orientation]
        if not a_grp:
            continue
        if not n_grp:
            non_apparies.extend(a_grp)
            continue

        matrice = np.array([[cout(a, n) for n in n_grp] for a in a_grp])
        lignes, colonnes = linear_sum_assignment(matrice)

        apparies_ici = set()
        for i, j in zip(lignes, colonnes):
            # Rejette via le MEME critere que le cout (matrice[i][j]), pas une
            # revalidation separee -- un filtre qui ne revalidait que
            # longueur/azimut laissait passer des paires que le cout avait
            # pourtant jugees prohibitives sur la position (confirme sur
            # Francois Villon : ancien n.2 reste apparie a un mur a 5,3m).
            if matrice[i][j] < COUT_PROHIBITIF:
                a, n = a_grp[i], n_grp[j]
                paires.append((a, n))
                apparies_ici.add(i)
                nouveaux_disponibles.remove(n)
        non_apparies.extend(a for i, a in enumerate(a_grp) if i not in apparies_ici)

    return paires, non_apparies


def _angle_diff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def _polygon_recouvrement(rings_a, rings_b):
    """Taux de recouvrement (IoU, intersection / union) entre deux polygones
    APUR (listes d'anneaux xy en metres). 1.0 = identiques, 0.0 = disjoints."""
    poly_a = Polygon(rings_a[0], rings_a[1:])
    poly_b = Polygon(rings_b[0], rings_b[1:])
    if not poly_a.is_valid:
        poly_a = make_valid(poly_a)
    if not poly_b.is_valid:
        poly_b = make_valid(poly_b)
    inter = poly_a.intersection(poly_b).area
    union = poly_a.union(poly_b).area
    return inter / union if union > 0 else 0.0


def recherche_par_recouvrement(apur_data, rings_attendus, seuil=RECOUVREMENT_MIN):
    """Cherche, parmi TOUS les candidats du cache APUR, celui dont le
    polygone recouvre le mieux rings_attendus (empreinte enregistree lors de
    la selection manuelle) -- contrairement a apur_objectid (reattribue a
    chaque republication de la couche), la geometrie reste stable. Retourne
    (candidat, recouvrement) ou (None, meilleur_recouvrement_trouve) si rien
    ne depasse le seuil."""
    meilleur_cand, meilleur_score = None, 0.0
    for feat in apur_data.get("features", []):
        score = _polygon_recouvrement(rings_attendus, feat["geometry"]["rings"])
        if score > meilleur_score:
            meilleur_cand, meilleur_score = feat, score
    if meilleur_score >= seuil:
        return meilleur_cand, meilleur_score
    return None, meilleur_score


def verifie_identite_batiment(choice, rnb_cand, apur_cand):
    """Verifie que le candidat retrouve (RNB + APUR) correspond a celui
    enregistre lors de la selection manuelle. Retourne (ok, source, raison),
    source valant 'rnb' ou 'apur' quand ok=False -- dit QUEL cote reparer.
    Un echec 'rnb' ne doit jamais etre compense par une reparation APUR
    (sources independantes, voir resoudre_identite()).

    Priorite a l'empreinte geometrique (recouvrement >=RECOUVREMENT_MIN) si
    disponible : une hauteur seule n'identifie pas un batiment de facon
    fiable (des batiments voisins peuvent avoir une hauteur proche, et la
    hauteur d'un meme batiment peut legitimement changer entre deux
    republications APUR). A defaut (pas d'empreinte enregistree), repli sur
    la comparaison de hauteur et de rnb_id.
    """
    rnb_id_attendu = choice.get("rnb_id")
    rnb_id_actuel = rnb_cand.get("rnb_id")
    if rnb_id_attendu and rnb_id_actuel and rnb_id_attendu != rnb_id_actuel:
        return False, "rnb", f"rnb_id attendu={rnb_id_attendu}, actuel={rnb_id_actuel}"

    rings_attendus = choice.get("apur_rings")
    if rings_attendus is not None:
        recouvrement = _polygon_recouvrement(rings_attendus, apur_cand["geometry"]["rings"])
        if recouvrement < RECOUVREMENT_MIN:
            return False, "apur", f"recouvrement geometrique={recouvrement:.1%} (seuil {RECOUVREMENT_MIN:.0%})"
        return True, None, None

    # Repli : comparaison de hauteur (moins fiable, voir docstring)
    h_attendu = choice.get("apur_h_moy")
    h_actuel = apur_cand["attributes"].get("h_moy")
    if h_attendu is not None and h_actuel is not None and abs(h_actuel - h_attendu) > 1.0:
        return False, "apur", f"h_moy attendu={h_attendu:.2f}m, actuel={h_actuel:.2f}m (pas d'empreinte geometrique enregistree pour une verification plus fiable)"
    return True, None, None


def recherche_rnb_par_id(rnb_data, rnb_id_attendu):
    """Cherche le candidat RNB dont rnb_id correspond exactement, parmi TOUS
    les candidats du cache actuel -- contrairement a rnb_index (une position
    dans la liste de reponse, qui n'est pas garantie stable : l'API peut
    renvoyer ses candidats dans un ordre different d'un appel a l'autre).
    Retourne le candidat ou None."""
    return next(
        (c for c in rnb_data.get("results", []) if c.get("rnb_id") == rnb_id_attendu),
        None,
    )


def resoudre_identite(choice, rnb_data, apur_data):
    """Retrouve le bon candidat RNB et APUR pour un batiment, en verifiant
    les DEUX sources independamment et en ne forcant jamais un statut a la
    main (regles CLAUDE.md section 2). Retourne
    (rnb_cand, apur_cand, propositions, echec) ou echec vaut None si tout est
    coherent (candidats directement valides) et propositions est une liste
    de reparations EVENTUELLES (jamais appliquees ici, jamais ecrites dans
    choice/manual_selection.json -- seulement remontees a l'appelant).

    1. Candidat RNB : par rnb_id (stable) en priorite, jamais par rnb_index
       seul (une position dans la reponse RNB n'est pas garantie stable --
       constate : l'ordre peut changer d'un appel a l'autre). rnb_index ne
       sert que de repli borne-verifie si aucun rnb_id n'a jamais ete
       enregistre.
    2. Candidat APUR : par apur_objectid, ou par recouvrement geometrique
       (recherche_par_recouvrement) si introuvable ou insuffisant.
    3. Avec les candidats FINAUX (repares ou non), rappelle UNE SEULE FOIS
       verifie_identite_batiment() -- jamais de ok=True ecrit a la main.
       C'est ce qui manquait aux versions precedentes : reparer un cote ne
       validait pas l'autre de facon independante, et une reparation APUR
       pouvait a tort valider un echec RNB jamais revalide.
    """
    propositions = []

    # 1. Candidat RNB, par rnb_id en priorite
    rnb_id_attendu = choice.get("rnb_id")
    rnb_cand = recherche_rnb_par_id(rnb_data, rnb_id_attendu) if rnb_id_attendu else None
    if rnb_cand is None and rnb_id_attendu is None:
        idx = choice.get("rnb_index")
        resultats = rnb_data.get("results", [])
        if idx is not None and 0 <= idx < len(resultats):
            rnb_cand = resultats[idx]
    if rnb_cand is None:
        return None, None, propositions, ("rnb", f"rnb_id={rnb_id_attendu} introuvable parmi les candidats RNB actuels (ou rnb_index hors bornes / jamais enregistre)")

    rnb_index_actuel = rnb_data["results"].index(rnb_cand)
    if choice.get("rnb_index") != rnb_index_actuel:
        propositions.append({
            "champ": "rnb_index",
            "ancien": choice.get("rnb_index"),
            "nouveau": rnb_index_actuel,
            "preuve": f"rnb_id={rnb_id_attendu} retrouve a une autre position (ordre RNB different)",
        })

    # 2. Candidat APUR, par apur_objectid ou par recouvrement
    apur_cand = next(
        (f for f in apur_data["features"] if f["attributes"]["OBJECTID"] == choice.get("apur_objectid")),
        None,
    )
    rings_attendus = choice.get("apur_rings")
    if apur_cand is not None and rings_attendus is not None:
        if _polygon_recouvrement(rings_attendus, apur_cand["geometry"]["rings"]) < RECOUVREMENT_MIN:
            apur_cand = None  # le candidat direct n'est pas le bon malgre le meme OBJECTID
    if apur_cand is None and rings_attendus is not None:
        nouveau_cand, score = recherche_par_recouvrement(apur_data, rings_attendus)
        if nouveau_cand is not None:
            propositions.append({
                "champ": "apur_objectid",
                "ancien": choice.get("apur_objectid"),
                "nouveau": nouveau_cand["attributes"]["OBJECTID"],
                "preuve": f"recouvrement geometrique {score:.1%}",
            })
            apur_cand = nouveau_cand
    if apur_cand is None:
        return None, None, propositions, ("apur", "apur_objectid introuvable et recherche par recouvrement infructueuse (ou pas d'empreinte apur_rings enregistree)")

    # 3. Revalidation finale, independante, jamais forcee
    ok, source, raison = verifie_identite_batiment(choice, rnb_cand, apur_cand)
    if not ok:
        return None, None, propositions, (source, raison)

    return rnb_cand, apur_cand, propositions, None


def valide_hauteur(bid, hauteur_m, note):
    """Compare la hauteur mesuree au nombre d'etages deja connu (DPE).
    Retourne (statut, etages_estimes, ecart) sans jamais planter le pipeline --
    seul un statut 'SUSPECT' sans note doit bloquer la fusion en donnee finale.
    statut : 'ok' (ecart normal), 'explique' (ecart important mais justifie par
    une note humaine), 'a_verifier' (ecart notable, pas de note -> a checker),
    'suspect' (ecart enorme, pas de note -> tres probablement le mauvais
    batiment, exclusion recommandee).
    """
    data_path = os.path.join(FRONTEND_DATA_DIR, f"{bid}.json")
    etages_connus = None
    if os.path.exists(data_path):
        with open(data_path, encoding="utf-8") as f:
            etages_connus = json.load(f)["batiment"].get("nombre_etages")

    if hauteur_m is None or not etages_connus:
        return "non_verifiable", None, None

    etages_estimes = round(hauteur_m / HAUTEUR_ETAGE_STD, 1)
    ecart = round(etages_estimes - etages_connus, 1)

    if abs(ecart) <= ECART_ETAGES_OK:
        statut = "ok"
    elif note:
        statut = "explique"
    elif abs(ecart) <= ECART_ETAGES_SUSPECT:
        statut = "a_verifier"
    else:
        statut = "suspect"

    return statut, etages_estimes, ecart


def cmd_compute():
    if not os.path.exists(MANUAL_SELECTION_PATH):
        print(f"Fichier manquant : {MANUAL_SELECTION_PATH}")
        print('Format attendu : {"2": {"rnb_index": 0, "apur_objectid": 4821}, ...}')
        sys.exit(1)

    with open(MANUAL_SELECTION_PATH, encoding="utf-8") as f:
        selection = json.load(f)
    ensure_dirs()

    # Jamais de fichier de propositions perime : une proposition d'une
    # execution precedente (ex. un probleme depuis resolu) ne doit jamais
    # rester silencieusement sur le disque -- purge systematique avant
    # chaque execution, reecrit seulement si cette execution en genere.
    if os.path.exists(MANUAL_SELECTION_PROPOSED_PATH):
        os.remove(MANUAL_SELECTION_PROPOSED_PATH)

    a_verifier_ou_suspects = []
    n_ecrits = 0
    propositions_globales = []

    for bid_str, choice in selection.items():
        bid = int(bid_str)
        print(f"\n=== {bid} ===")
        with open(os.path.join(RAW_RNB_DIR, f"{bid}.json"), encoding="utf-8") as f:
            rnb_data = json.load(f)
        try:
            _validate_rnb_response(rnb_data)
        except RuntimeError as e:
            print(f"  /!\\ ERREUR : cache RNB invalide -- {e} (relancer 'fetch' pour ce batiment).")
            a_verifier_ou_suspects.append((bid, "cache_rnb_invalide", str(e)))
            continue
        with open(os.path.join(RAW_APUR_DIR, f"{bid}.json"), encoding="utf-8") as f:
            apur_data = json.load(f)
        try:
            nom_bid, lat_bid, lon_bid = get_batiment_coords(bid)
            _validate_apur_response(apur_data, lat_bid, lon_bid)
        except RuntimeError as e:
            print(f"  /!\\ ERREUR : cache APUR invalide -- {e} (relancer 'fetch' pour ce batiment).")
            a_verifier_ou_suspects.append((bid, "cache_apur_invalide", str(e)))
            continue

        # resoudre_identite() verifie RNB et APUR independamment, et ne
        # force jamais un statut a la main -- voir sa docstring. Toute
        # reparation necessaire est une PROPOSITION (jamais appliquee ici,
        # jamais ecrite dans manual_selection.json -- regle CLAUDE.md "dans
        # le doute on bloque" + "aucune ecriture automatique dans les
        # entrees validees par un humain").
        rnb_cand, apur_cand, propositions, echec = resoudre_identite(choice, rnb_data, apur_data)
        if propositions:
            for p in propositions:
                propositions_globales.append({"batiment": bid, **p})

        if echec is not None:
            source, raison = echec
            print(f"  /!\\ ERREUR : {raison}. "
                  + (f"Reparation(s) possible(s) mais seulement PROPOSEE(S) (voir "
                     f"{MANUAL_SELECTION_PROPOSED_PATH} apres execution)."
                     if propositions else "Aucune reparation automatique possible.")
                  + f" Bâtiment bloque, revoir raw/review/{bid}.geojson a la main.")
            a_verifier_ou_suspects.append((bid, f"echec_{source}", raison))
            continue

        if propositions:
            # CLAUDE.md "dans le doute on bloque" : meme quand la reparation
            # semble evidente et que la revalidation finale est passee
            # (echec is None), on NE l'applique pas silencieusement -- la
            # sortie n'est ecrite qu'une fois la proposition relue et
            # reportee a la main dans manual_selection.json par l'utilisateur.
            print(f"  /!\\ Identite retrouvee mais seulement via {len(propositions)} proposition(s) "
                  f"(voir {MANUAL_SELECTION_PROPOSED_PATH}) -- bâtiment bloque par precaution, "
                  f"aucune sortie ecrite tant que la proposition n'est pas validee a la main.")
            a_verifier_ou_suspects.append((bid, "proposition_en_attente", f"{len(propositions)} proposition(s)"))
            continue

        attrs = apur_cand["attributes"]

        adresses = [
            {
                "numero": a.get("street_number"),
                "suffixe": a.get("street_rep"),
                "rue": a.get("street"),
                "ville": a.get("city_name"),
                "code_postal": a.get("city_zipcode"),
            }
            for a in rnb_cand.get("addresses", [])
        ]

        rings = apur_cand["geometry"]["rings"]
        if len(rings) > 1:
            aires = [round(abs(_signed_area(r)), 1) for r in rings]
            print(
                f"  /!\\ ATTENTION : polygone a {len(rings)} anneaux (aires : {aires} m2). "
                f"Les facades du/des anneau(x) interieur(s) (patio, cour couverte) sont generees "
                f"comme celles du contour exterieur (segments courts <2m classes 'bruit' -- un "
                f"patio circulaire reste souvent entierement en bruit, cf. Gutenberg : limite "
                f"connue, non resolue par cette orientation correcte seule)."
            )
        facades = polygon_with_holes_to_facades(rings)

        hauteur_m = round(attrs["h_moy"], 2) if attrs.get("h_moy") is not None else None
        note = choice.get("note")
        statut, etages_estimes, ecart = valide_hauteur(bid, hauteur_m, note)

        enrichment = {
            "rnb_id": rnb_cand.get("rnb_id"),
            "rnb_adresses": adresses,
            # Le fichier de sortie est TOUJOURS ecrit integralement (hauteur
            # et facades comprises), quel que soit le statut -- rien n'est
            # exclu automatiquement du fichier. Seul rnb_verifie passe a
            # False si l'ecart hauteur/etages est trop grand et non justifie,
            # pour signaler a la fusion MANUELLE (cf. docstring en tete de
            # fichier) de ne pas reprendre ces donnees sans verification.
            "rnb_verifie": statut in ("ok", "explique"),
            "hauteur_m": hauteur_m,
            "hauteur_min_m": round(attrs["h_min"], 2) if attrs.get("h_min") is not None else None,
            "hauteur_max_m": round(attrs["h_max"], 2) if attrs.get("h_max") is not None else None,
            "facade_segments": facades,
            "facade_source": "apur",
            "hauteur_verification": {
                "statut": statut,
                "etages_estimes": etages_estimes,
                "ecart_etages": ecart,
                "note": note,
            },
        }

        out_path = os.path.join(OUT_DIR, f"{bid}_enrichment.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(enrichment, f, ensure_ascii=False, indent=2)
        n_ecrits += 1
        n_reelles = sum(1 for f in facades if not f["bruit"])
        marqueur = {
            "ok": "OK",
            "explique": "OK (justifie)",
            "a_verifier": "A VERIFIER (rnb_verifie=False, fichier ecrit quand meme)",
            "suspect": "SUSPECT (rnb_verifie=False, fichier ecrit quand meme -- NE PAS fusionner sans verification)",
            "non_verifiable": "non verifiable",
        }[statut]
        print(f"  hauteur_m={hauteur_m} etages_estimes={etages_estimes} ecart={ecart} -> {marqueur}")
        print(f"  facades={n_reelles} (+{len(facades)-n_reelles} bruit) -> {out_path}")
        if statut in ("a_verifier", "suspect"):
            a_verifier_ou_suspects.append((bid, statut, ecart))

    if propositions_globales:
        # CLAUDE.md : aucune reparation automatique n'est appliquee --
        # ecrite ici dans un fichier separe, a valider a la main avant de
        # modifier manual_selection.json soi-meme.
        with open(MANUAL_SELECTION_PROPOSED_PATH, "w", encoding="utf-8") as f:
            json.dump(propositions_globales, f, ensure_ascii=False, indent=2)
        print(f"\n/!\\ {len(propositions_globales)} proposition(s) de reparation ecrite(s) dans "
              f"{MANUAL_SELECTION_PROPOSED_PATH} -- NON appliquee(s). A relire et reporter a la main "
              f"dans manual_selection.json si elles sont justes.")
    else:
        print(f"\nAucune proposition de reparation cette execution ({MANUAL_SELECTION_PROPOSED_PATH} absent).")

    n_erreurs = len(selection) - n_ecrits
    print(f"\n{n_ecrits}/{len(selection)} batiment(s) ecrit(s) avec succes. Fusionner ensuite chaque "
          "out/{id}_enrichment.json dans frontend/data/batiment/{id}.json (a la main, sous la cle "
          "'batiment').")

    if a_verifier_ou_suspects:
        print("\n/!\\ Batiments necessitant une verification avant fusion :")
        for bid, statut, ecart in a_verifier_ou_suspects:
            print(f"   - {bid} : {statut} (ecart={ecart}) -> revoir raw/review/{bid}.geojson"
                  f" et mettre a jour manual_selection.json")

    if n_erreurs > 0:
        print(f"\n/!\\ {n_erreurs} batiment(s) en erreur -- code de sortie 1 (aucun fichier n'a ete "
              "ecrit pour ces bâtiments, un enchainement automatique doit s'arreter ici).")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in ("fetch", "compute"):
        print("Usage: python enrich_rnb_apur.py [fetch|compute]")
        sys.exit(1)
    if sys.argv[1] == "fetch":
        cmd_fetch()
    else:
        cmd_compute()
