"""
Recalcule `conso_mesuree_kwh_m2` depuis les vraies factures mensuelles
2023-2025 (`consommations_mensuelles`), deja presentes dans chaque
data/batiment/{id}.json mais jamais utilisees pour mettre a jour ce champ
depuis leur import -- la valeur affichee restait celle du DPE 2009 (ou d'un
audit plus recent pour Gutenberg/Buffon) pour la plupart des batiments.

Regles d'honnetete (actees en session) :
- moyenne glissante sur les annees calendaires COMPLETES (12 mois distincts
  presents) parmi 2023/2024/2025 -- 2026 est exclue car l'annee est partielle
  dans la source (facturation arretee a mi-2026), l'inclure fausserait la
  moyenne vers le bas.
- un 0 kWh suspect (meme logique que zeroEstSuspect() dans lib/api.ts) est
  exclu de la somme, pas traite comme une vraie consommation nulle : tout 0
  d'Electricite est suspect ; un 0 de Gaz/Vapeur ne l'est que hors saison
  morte de chauffe (mai-septembre).
- un batiment sans surface_m2 connue ou sans annee complete 2023-2025 n'est
  pas touche -- pas de valeur inventee pour combler l'absence.
- la note conso_incertitude existante (ex. ratio de repartition du compteur
  partage de Buffon) est completee, jamais ecrasee.

Usage : python recompute_conso_mesuree.py
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "frontend" / "data"
SAISON_MORTE_CHAUFFAGE = {5, 6, 7, 8, 9}
ANNEES_FENETRE = ("2023", "2024", "2025")


def ecart_kwh_m2(conso):
    """Ecart absolu (kWh/m2) a l'objectif -40% propre au batiment -- meme
    formule que objectifConso()/ecartKwhM2() dans lib/api.ts, pas un seuil
    fixe commun au parc."""
    return round(conso - round(conso * 0.6))


def zero_est_suspect(kwh, mois, energie):
    if kwh != 0:
        return False
    if energie == "Électricité":
        return True
    m = int(mois.split("-")[1])
    return m not in SAISON_MORTE_CHAUFFAGE


def annees_completes(mensuelles):
    """Une annee n'est 'complete' que si CHAQUE energie deja vue pour ce
    batiment (pas seulement l'une d'elles) a bien ses 12 mois distincts
    cette annee-la. Sinon une energie qui cesse d'etre facturee (ex. Gaz
    de Gutenberg a partir de mars 2025) passe inapercue tant qu'une autre
    energie (ici l'Electricite) reste complete -- et tire la moyenne vers
    le bas sans raison reelle."""
    energies = sorted(set(m["energie"] for m in mensuelles))
    annees = []
    trous = {}
    for y in ANNEES_FENETRE:
        manquantes = [
            e for e in energies
            if sum(1 for m in mensuelles if m["energie"] == e and m["mois"].startswith(y)) != 12
        ]
        if manquantes:
            trous[y] = manquantes
        else:
            annees.append(y)
    return annees, trous


def recompute(batiment):
    """Retourne (nouvelle_conso, annees_utilisees, trous) ou (None, [], {}) si impossible."""
    mensuelles = batiment.get("consommations_mensuelles") or []
    surface = batiment.get("surface_m2")
    if not mensuelles or not surface:
        return None, [], {}
    annees, trous = annees_completes(mensuelles)
    if not annees:
        return None, [], trous
    totaux = []
    for y in annees:
        total = sum(
            m["kwh"] for m in mensuelles
            if m["mois"].startswith(y) and not zero_est_suspect(m["kwh"], m["mois"], m["energie"])
        )
        totaux.append(total)
    conso = round(sum(totaux) / len(totaux) / surface, 1)
    return conso, annees, trous


def patch_batiment_obj(b, conso, annees, trous, ancienne_conso, ancienne_annee):
    deja_a_jour = (
        b.get("conso_mesuree_kwh_m2") == conso
        and b.get("conso_origine") == "mesuree"
        and b.get("annee_mesure") == int(annees[-1])
    )
    if deja_a_jour:
        return False
    b["conso_mesuree_kwh_m2"] = conso
    b["conso_origine"] = "mesuree"
    b["annee_mesure"] = int(annees[-1])
    if ancienne_conso is None:
        remplace = "Premiere valeur mesuree pour ce batiment (aucune consommation mesuree disponible avant)."
    else:
        remplace = (
            f"Remplace l'ancienne valeur ({ancienne_conso} kWh/m2"
            + (f", mesuree en {ancienne_annee}" if ancienne_annee else "")
            + ")."
        )
    trou_note = ""
    for y, energies in sorted(trous.items()):
        trou_note += (
            f" {y} exclue de la moyenne : {', '.join(energies)} n'a pas 12 mois factures cette annee-la "
            f"(facturation probablement interrompue, pas une vraie baisse de consommation -- a confirmer)."
        )
    note = (
        f"Recalcule le {annees[0]}-{annees[-1]} : moyenne glissante sur les annees "
        f"calendaires completes des factures reelles ({', '.join(annees)}), toutes "
        f"energies confondues, divisee par la surface. Les mois a 0 kWh suspects "
        f"(facture manquante probable) sont exclus de la somme. {remplace}{trou_note}"
    )
    # Ne garde de l'ancienne note que la partie humaine (ex. compteur
    # partage de Buffon) -- notre propre note auto-generee, elle,
    # commence toujours par "Recalcule le " et doit etre REMPLACEE, pas
    # empilee indefiniment a chaque reexecution du script.
    existante = b.get("conso_incertitude")
    humaine = existante.split("Recalcule le ")[0].rstrip() if existante else None
    b["conso_incertitude"] = f"{humaine} {note}" if humaine else note
    return True


def patch_file(path, patches, get_batiment_objs):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    objs = get_batiment_objs(data)
    n = 0
    for obj in objs:
        bid = obj.get("id")
        if bid in patches:
            conso, annees, trous = patches[bid]
            if patch_batiment_obj(obj, conso, annees, trous, obj.get("conso_mesuree_kwh_m2"), obj.get("annee_mesure")):
                n += 1
    if n:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return n


def sync_levier_batiments(canoniques):
    """data/levier/{1..6}.json embarquaient une copie figee (jeu de demo
    perime : mauvaise surface_m2/energie_principale, jamais synchronisee)
    de l'objet batiment -- on la remplace entierement par la version
    canonique a jour (tous les batiments, pas seulement ceux recalcules),
    pas un patch champ par champ."""
    for i in range(1, 7):
        levier_path = DATA_DIR / "levier" / f"{i}.json"
        if not levier_path.exists():
            continue
        with open(levier_path, encoding="utf-8") as f:
            data = json.load(f)
        n = 0
        for entry in data.get("batiments", []):
            bid = entry.get("batiment", {}).get("id")
            if bid in canoniques:
                entry["batiment"] = dict(canoniques[bid])
                n += 1
        with open(levier_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        print(f"levier/{i}.json : {n} batiments resynchronises avec la fiche canonique")


def recompute_indicateurs_racine(data, patches, batiments_complets):
    documentes = []
    presents = set()
    for entry in data.get("classement_ecart_objectif", []):
        b = entry["batiment"]
        bid = b.get("id")
        presents.add(bid)
        if bid in patches:
            conso, annees, trous = patches[bid]
            ancienne_conso, ancienne_annee = b.get("conso_mesuree_kwh_m2"), b.get("annee_mesure")
            patch_batiment_obj(b, conso, annees, trous, ancienne_conso, ancienne_annee)
        if b.get("conso_mesuree_kwh_m2") is not None:
            entry["ecart_kwh_m2"] = ecart_kwh_m2(b["conso_mesuree_kwh_m2"])
            entry.pop("ecart_pct", None)
            documentes.append((entry["ecart_kwh_m2"], b.get("surface_m2"), b["conso_mesuree_kwh_m2"]))

    # Batiments nouvellement documentes (ex. Oscar Wilde, jamais mesure avant)
    # mais absents du classement -- on les y ajoute, on ne se contente pas de
    # patcher en place.
    for bid, (conso, annees, trous) in patches.items():
        if bid in presents:
            continue
        b = batiments_complets[bid]
        gap = ecart_kwh_m2(conso)
        data.setdefault("classement_ecart_objectif", []).append({"batiment": b, "ecart_kwh_m2": gap})
        documentes.append((gap, b.get("surface_m2"), conso))

    data["classement_ecart_objectif"].sort(key=lambda e: e["ecart_kwh_m2"], reverse=True)

    surfaces_valides = [(c, s) for _, s, c in documentes if s]
    if surfaces_valides:
        tot_surf = sum(s for _, s in surfaces_valides)
        data["conso_moyenne_ponderee_kwh_m2"] = round(
            sum(c * s for c, s in surfaces_valides) / tot_surf, 1
        )
    data.pop("ecart_moyen_objectif_2030_pct", None)
    # Pondere par surface, comme conso_moyenne_ponderee_kwh_m2 ci-dessus (pas
    # une moyenne simple par batiment) -- coherent avec le -40% etant une
    # fraction constante de la conso : ecart pondere = 0,4 x conso_moyenne_ponderee.
    gaps_valides = [(e, s) for e, s, _ in documentes if s]
    if gaps_valides:
        tot_surf_gap = sum(s for _, s in gaps_valides)
        data["ecart_moyen_objectif_2030_kwh_m2"] = round(
            sum(e * s for e, s in gaps_valides) / tot_surf_gap, 1
        )
    data["nb_batiments_documentes"] = len(documentes)


def main():
    patches = {}
    batiments_complets = {}
    for path in sorted((DATA_DIR / "batiment").glob("*.json"), key=lambda p: int(p.stem)):
        with open(path, encoding="utf-8") as f:
            b = json.load(f)["batiment"]
        conso, annees, trous = recompute(b)
        if conso is None:
            print(f"id={b['id']} ({b['nom']}) : donnees insuffisantes, laisse en l'etat")
            continue
        patches[b["id"]] = (conso, annees, trous)
        ancienne_conso, ancienne_annee = b.get("conso_mesuree_kwh_m2"), b.get("annee_mesure")
        changed = patch_batiment_obj(b, conso, annees, trous, ancienne_conso, ancienne_annee)
        print(f"id={b['id']} ({b['nom']}) : {ancienne_conso} -> {conso} kWh/m2 (annees {annees}){' [deja a jour]' if not changed else ''}")
        # Copie patchee en memoire, pour l'inserer dans indicateurs.json si ce
        # batiment n'y figurait pas encore (ex. Oscar Wilde), et pour
        # resynchroniser les copies embarquees dans data/levier/*.json.
        batiments_complets[b["id"]] = b

    if not patches:
        print("Rien a patcher.")
        return

    for bid, (conso, annees, trous) in patches.items():
        detail_path = DATA_DIR / "batiment" / f"{bid}.json"
        patch_file(
            detail_path,
            patches,
            lambda data, _bid=bid: [data["batiment"]] if data["batiment"].get("id") == _bid else [],
        )

    n = patch_file(
        DATA_DIR / "batiments.json",
        patches,
        lambda data: [item["batiment"] for item in data],
    )
    print(f"batiments.json patche ({n} batiments)")

    # Carte canonique complete (tous les batiments, pas seulement les 9
    # recalcules) pour resynchroniser data/levier/*.json integralement --
    # il embarquait un jeu de demo perime (surface_m2/energie_principale
    # jamais a jour), pas seulement une conso en retard.
    canoniques = {}
    for path in (DATA_DIR / "batiment").glob("*.json"):
        with open(path, encoding="utf-8") as f:
            b = json.load(f)["batiment"]
        canoniques[b["id"]] = b
    sync_levier_batiments(canoniques)

    indicateurs_path = DATA_DIR / "indicateurs.json"
    with open(indicateurs_path, encoding="utf-8") as f:
        data = json.load(f)
    recompute_indicateurs_racine(data, patches, batiments_complets)
    with open(indicateurs_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(
        f"indicateurs.json patche : conso_moyenne_ponderee_kwh_m2={data['conso_moyenne_ponderee_kwh_m2']}, "
        f"ecart_moyen_objectif_2030_kwh_m2={data['ecart_moyen_objectif_2030_kwh_m2']}, "
        f"nb_batiments_documentes={data['nb_batiments_documentes']}"
    )


if __name__ == "__main__":
    main()
