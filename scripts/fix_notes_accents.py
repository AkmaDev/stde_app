# -*- coding: utf-8 -*-
"""
Corrige l'orthographe (accents manquants) de 7 notes reelles deja stockees
dans data/batiment/*.json (facade_segments[].vitrage_note,
hauteur_verification.note), et retire une citation de fichier .md interne
(illisible pour un visiteur du site) dans la note de hauteur de Francois
Villon. Aucun contenu invente : meme sens, meme chiffres, orthographe
restauree et une phrase raccourcie proprement.

Usage : python fix_notes_accents.py
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"

REPLACEMENTS = {
    # Buffon (id=2)
    "Ecart hauteur/etages attendu : la bibliotheque n'occupe que les etages R+2 a R+5 d'un batiment R+5 partage avec l'ecole maternelle (RDC a R+2). La hauteur APUR mesure tout le volume physique du sol au toit, pas seulement les etages de la bibliotheque. Cf. DPE p.5, section 1.1.":
    "Écart hauteur/étages attendu : la bibliothèque n'occupe que les étages R+2 à R+5 d'un bâtiment R+5 partagé avec l'école maternelle (RDC à R+2). La hauteur APUR mesure tout le volume physique du sol au toit, pas seulement les étages de la bibliothèque. Cf. DPE p.5, section 1.1.",

    "Facade verifiee comme mitoyenne le 03/09/2026 : distance mesuree au batiment voisin le plus proche (donnees APUR) ~0 m sur toute la longueur de la facade -- vrai mur mitoyen, pas une donnee manquante. Methode : reconstruction des aretes reelles du contour APUR + calcul de distance point-segment vers tous les batiments voisins dans la meme zone.":
    "Façade vérifiée comme mitoyenne le 03/09/2026 : distance mesurée au bâtiment voisin le plus proche (données APUR) ~0 m sur toute la longueur de la façade — vrai mur mitoyen, pas une donnée manquante. Méthode : reconstruction des arêtes réelles du contour APUR + calcul de distance point-segment vers tous les bâtiments voisins dans la même zone.",

    "Vitrage estime a partir des plans de facade reels (Cabinet GEOSAT, 1/100, 2022) transmis par la ma\xeetrise d'ouvrage le 03/09/2026 : bandeaux vitres continus du R+1 au R+5, RDC moins vitre (entree/local technique). Estimation visuelle ponderee sur la hauteur totale (RDC a R+5), pas etage par etage.":
    "Vitrage estimé à partir des plans de façade réels (Cabinet GEOSAT, 1/100, 2022) transmis par la maîtrise d'ouvrage le 03/09/2026 : bandeaux vitrés continus du R+1 au R+5, RDC moins vitré (entrée/local technique). Estimation visuelle pondérée sur la hauteur totale (RDC à R+5), pas étage par étage.",

    # Gutenberg (id=12)
    "Vitrage exterieur estime tres faible : le dossier de plans indique explicitement que les facades vitrees sont concentrees sur le patio central circulaire interieur, pas sur le perimetre exterieur du batiment. Le vrai vitrage significatif (patio) n'est pas capture par ce modele de facades (base sur l'empreinte exterieure APUR).":
    "Vitrage extérieur estimé très faible : le dossier de plans indique explicitement que les façades vitrées sont concentrées sur le patio central circulaire intérieur, pas sur le périmètre extérieur du bâtiment. Le vrai vitrage significatif (patio) n'est pas capturé par ce modèle de façades (basé sur l'empreinte extérieure APUR).",

    # Colette Vivier (id=13)
    "Ecart leger (1.3 etage), plausible : le DPE decrit une toiture-verriere en pente au-dessus des espaces de lecture avec mezzanines/podiums plutot que des etages classiques de hauteur standard -- une hauteur sous toiture plus grande que 3m/etage est attendue.":
    "Écart léger (1,3 étage), plausible : le DPE décrit une toiture-verrière en pente au-dessus des espaces de lecture avec mezzanines/podiums plutôt que des étages classiques de hauteur standard — une hauteur sous toiture plus grande que 3 m/étage est attendue.",

    # Jean-Pierre Melville (id=16)
    "Estimation basee sur les elevations reelles (dossier 2_Plans pdf, adresse confirmee 77-79 rue Nationale) : facade en mur-rideau quasi integral, labellisee 'DOUBLE VITRAGE FEUILLETE' sur le plan.":
    "Estimation basée sur les élévations réelles (dossier 2_Plans pdf, adresse confirmée 77-79 rue Nationale) : façade en mur-rideau quasi intégral, labellisée « DOUBLE VITRAGE FEUILLETÉ » sur le plan.",

    "Calcule (pas estime a l'oeil) a partir des cotes reelles du plan d'elevation Sud-Ouest (dossier 2_Plans pdf) et des niveaux de la coupe transversale. La facade se decompose en 4 zones horizontales (6,32 / 6,60 / 1,10 / 12,30 m). Seule la zone a 6,60 m est une vraie baie vitree continue (cotes reelles 1,25+1,79+1,79+1,35 m = 93,6% vitre dans cette zone). Les zones a 6,32 m et 12,30 m sont en realite du bardage ALUCOBOND opaque (etiquete comme tel sur le plan) avec seulement quelques petites fenetres ponctuelles -- corrige par rapport a l'estimation precedente qui les supposait vitrees. RDC distinct, vitrage feuillete sur 3 baies de 3,58 m. Taux pondere par zone et par hauteur de niveau (coupe transversale) : environ 31%. Mesure plus rigoureuse qu'avant mais pas garantie a 100% -- lecture d'un scan ancien, quelques hypotheses sur le comptage des etages avec fenetre ponctuelle en zone ALUCOBOND.":
    "Calculé (pas estimé à l'œil) à partir des cotes réelles du plan d'élévation Sud-Ouest (dossier 2_Plans pdf) et des niveaux de la coupe transversale. La façade se décompose en 4 zones horizontales (6,32 / 6,60 / 1,10 / 12,30 m). Seule la zone à 6,60 m est une vraie baie vitrée continue (cotes réelles 1,25+1,79+1,79+1,35 m = 93,6 % vitrée dans cette zone). Les zones à 6,32 m et 12,30 m sont en réalité du bardage ALUCOBOND opaque (étiqueté comme tel sur le plan) avec seulement quelques petites fenêtres ponctuelles — corrigé par rapport à l'estimation précédente qui les supposait vitrées. RDC distinct, vitrage feuilleté sur 3 baies de 3,58 m. Taux pondéré par zone et par hauteur de niveau (coupe transversale) : environ 31 %. Mesure plus rigoureuse qu'avant mais pas garantie à 100 % — lecture d'un scan ancien, quelques hypothèses sur le comptage des étages avec fenêtre ponctuelle en zone ALUCOBOND.",

    "Estimation basee sur l'elevation Sud-Ouest reelle (meme dossier) : facade beaucoup plus fermee, fenetres individuelles cotees separees par des bandes de mur plein/allege.":
    "Estimation basée sur l'élévation Sud-Ouest réelle (même dossier) : façade beaucoup plus fermée, fenêtres individuelles cotées séparées par des bandes de mur plein/allège.",

    # Helene Berr (id=9)
    "Attribution a la facade Picpus incertaine -- meilleure hypothese basee sur la longueur du segment (le plus long, 26.1m), pas confirmee par l'orientation exacte des rues. Estimation : bande de fenetre / hauteur d'etage reelle (2.64m), lue visuellement sur l'elevation Facade Picpus (plan Mairie de Paris, 2010), pas une cote imprimee.":
    "Attribution à la façade Picpus incertaine — meilleure hypothèse basée sur la longueur du segment (le plus long, 26,1 m), pas confirmée par l'orientation exacte des rues. Estimation : bande de fenêtre / hauteur d'étage réelle (2,64 m), lue visuellement sur l'élévation Façade Picpus (plan Mairie de Paris, 2010), pas une cote imprimée.",

    # Francois Villon (id=11) -- retire aussi la citation .md
    "Ecart deja identifie et documente (pas une erreur de correspondance) : le DPE 2009 dit 3 etages (R+2) mais les plans d'origine 1980-84 montrent 6 niveaux avec logements de fonction. La hauteur mesuree (18,6m) confirme plutot l'hypothese des 6 niveaux. Question en attente aupres de la maitrise d'ouvrage, voir NOTES_EXTRACTION_DOCUMENTS_REELS.md.":
    "Écart déjà identifié et documenté (pas une erreur de correspondance) : le DPE 2009 dit 3 étages (R+2) mais les plans d'origine 1980-84 montrent 6 niveaux avec logements de fonction. La hauteur mesurée (18,6 m) confirme plutôt l'hypothèse des 6 niveaux. Question en attente auprès de la maîtrise d'ouvrage.",
}


def patch_texts(obj):
    changed = False
    hv = obj.get("hauteur_verification")
    if hv and hv.get("note") in REPLACEMENTS:
        hv["note"] = REPLACEMENTS[hv["note"]]
        changed = True
    for f in obj.get("facade_segments", []):
        note = f.get("vitrage_note")
        if note in REPLACEMENTS:
            f["vitrage_note"] = REPLACEMENTS[note]
            changed = True
    return changed


def main():
    canoniques = {}
    for path in sorted((DATA_DIR / "batiment").glob("*.json")):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if patch_texts(data["batiment"]):
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            print(f"{path.name} : notes corrigees")
        canoniques[data["batiment"]["id"]] = data["batiment"]

    batiments_path = DATA_DIR / "batiments.json"
    with open(batiments_path, encoding="utf-8") as f:
        liste = json.load(f)
    for item in liste:
        bid = item["batiment"]["id"]
        if bid in canoniques:
            item["batiment"] = dict(canoniques[bid])
    with open(batiments_path, "w", encoding="utf-8") as f:
        json.dump(liste, f, ensure_ascii=False, separators=(",", ":"))
    print("batiments.json resynchronise")

    for i in range(1, 7):
        levier_path = DATA_DIR / "levier" / f"{i}.json"
        if not levier_path.exists():
            continue
        with open(levier_path, encoding="utf-8") as f:
            d = json.load(f)
        for entry in d.get("batiments", []):
            bid = entry.get("batiment", {}).get("id")
            if bid in canoniques:
                entry["batiment"] = dict(canoniques[bid])
        with open(levier_path, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print("levier/*.json resynchronises")

    indicateurs_path = DATA_DIR / "indicateurs.json"
    with open(indicateurs_path, encoding="utf-8") as f:
        d = json.load(f)
    for entry in d.get("classement_ecart_objectif", []):
        bid = entry.get("batiment", {}).get("id")
        if bid in canoniques:
            entry["batiment"] = dict(canoniques[bid])
    with open(indicateurs_path, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print("indicateurs.json resynchronise")


if __name__ == "__main__":
    main()
