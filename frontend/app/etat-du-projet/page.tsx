// Page volontairement non listée dans la navigation principale — accessible
// via le lien discret dans le bloc SCORE de la fiche bâtiment. Liste à jour
// de ce qui reste en mode démo/à corriger dans l'app elle-même (pas le
// pipeline "courbes héliotropiques", déjà documenté dans
// BILAN_COURBES_HELIOTROPIQUES.md, hors de cette app).

const items: { titre: string; description: string }[] = [
  {
    titre: "François Villon en tête de priorité : biais de pondération, pas un gel/cache",
    description:
      "Les liens \"Fiche bâtiment\"/\"Documentation\" du menu pointent vers le bâtiment de plus haute priorité (prioriteGlobale), recalculé à chaque chargement — pas une valeur en cache. François Villon y reste en tête (86,4) parce qu'il n'a pas de données de vitrage, donc pas d'Urgence calculable : la formule renormalise alors les poids sur Risque+Faisabilité seulement (71,4 %/28,6 % au lieu de 50/30/20), ce qui gonfle mécaniquement son score par rapport aux bâtiments ayant les 3 critères (ex. Jean-Pierre Melville, 78,2, qui a pourtant une donnée en plus). Biais de formule connu, à recalibrer plutôt qu'à corriger au cas par cas.",
  },
  {
    titre: "Oscar Wilde : hauteur APUR suspecte (2,86 m pour 1 étage)",
    description:
      "hauteur_m = 2,86 m avec une fourchette min/max de 0,46 à 5,8 m sur un seul étage déclaré — écart bien plus large que sur les autres bâtiments, signe probable d'un bruit de mesure APUR plutôt qu'une vraie hauteur. Non corrigé faute de nouvelle mesure ou de document fiable : à vérifier auprès de la source avant d'utiliser cette donnée (elle alimente le calcul d'Urgence/apport solaire de ce bâtiment).",
  },
  {
    titre: "Badges Documentée/Hypothèse corrigés le 16/10 sur plusieurs champs",
    description:
      "Plusieurs champs affichaient un badge \"Documentée\" en contradiction avec leur propre méthode détaillée : A.2 (contrainte patrimoniale) et C.2 (hauteur d'étage) de Buffon sont passés en \"Hypothèse\", cohérent avec leur fiabilité \"Faible\"/\"Moyenne\" déjà documentée. L'intitulé patrimonial de Buffon (\"Site classé\") a été corrigé en \"Abords de monument historique (covisibilité ABF)\" — l'ancien texte mélangeait deux régimes juridiques différents (Code de l'environnement vs Code du patrimoine) alors que la seule justification connue (proximité du Jardin des Plantes, monument historique) relève du second. C.2 a aussi été renommé (retrait du mot \"réelle\", trompeur pour une simple division) et affiche désormais la mise en garde déjà stockée pour les bâtiments où la bibliothèque ne couvre qu'une partie de l'immeuble mesuré (ex. Buffon). Les rubriques de façade (E.1-E.5) badgeaient \"Documentée\" par défaut même sans aucune valeur réelle (ex. François Villon, vitrage inconnu sur toutes ses façades) — corrigé pour afficher \"Absente\" quand c'est le cas. D.2/D.3 (toiture) affichaient \"Fiabilité Élevée\" même quand la valeur du bâtiment est manquante — corrigé. D.4 affichait \"Source : Calcul SDTE\" par un filet de sécurité générique mal ciblé, en contradiction avec sa méthode réelle (\"Extraction manuelle\") — corrigé pour n'afficher \"Calcul SDTE\" que quand la méthode est réellement un calcul.",
  },
  {
    titre: "Score SCT / Urgence calculables pour une minorité de bâtiments",
    description:
      "Urgence (retiré le 28/08, reposait sur orientation_vitrage_dominante, ambigu) est redéfini depuis le 03/09 à partir de l'apport solaire réel (façades + vitrage + irradiance corrigée des masques) — mis à jour le 16/10 : calculable pour 5 bâtiments ayant cette donnée complète (Hélène Berr, Gutenberg, Jean-Pierre Melville, Oscar Wilde, Buffon depuis les plans GEOSAT), avec une échelle relative entre ces 5 seulement (pas de seuil absolu documenté ; Buffon sature déjà à 100, l'échelle est à recalibrer). Score global (SCT) n'est calculable que quand Risque, Urgence et Faisabilité le sont tous les trois — 5 bâtiments sur 11 désormais (Oscar Wilde a maintenant une consommation mesurée réelle, donc un Risque calculable ; seuls Claude Lévi-Strauss et Marguerite Duras en sont encore dépourvus).",
  },
  {
    titre: "Faisabilité : un seul critère, à enrichir",
    description:
      "Actuellement basé uniquement sur le statut patrimonial (classé/inscrit/ABF). Pistes d'enrichissement identifiées mais pas encore implémentées : nombre d'étages (accès/échafaudage), bâtiment ouvert au public pendant travaux ou non, état d'isolation déjà en place.",
  },
  {
    titre: "Tri de l'accueil, couleurs carte du parc et sidebar : migrés le 03/09, couverture partielle",
    description:
      "L'ancien score.sct figé (9 bâtiments sur 11 partageaient la même valeur fictive) a été remplacé par une vraie priorité calculée (Risque + Faisabilité, + Urgence quand disponible) ; le champ `score` mort lui-même a été retiré des fichiers de données le 16/10. Mis à jour le 16/10 : Risque reste indisponible pour 2 bâtiments seulement (Claude Lévi-Strauss, Marguerite Duras — pas de consommation connue) : ils restent en gris \"données insuffisantes\" plutôt que colorés. Parmi les 9 bâtiments colorés, 5 (Hélène Berr, Gutenberg, Jean-Pierre Melville, Oscar Wilde, Buffon) utilisent les 3 critères complets — les 4 autres n'ont pas d'Urgence calculable (vitrage manquant) et sont pondérés sur Risque + Faisabilité seulement.",
  },
  {
    titre: "Taux de vitrage manquant sur 3 bâtiments",
    description:
      "François Villon, Colette Vivier, Mohammed Arkoun n'ont pas de document exploitable (DOE/élévation) pour estimer leur vitrage par façade — en attente de documents que Jean doit retrouver. Mis à jour le 16/10 : Buffon en a désormais un (plans GEOSAT reçus le 03/09, 55 % en façades Sud et Nord), retiré de cette liste. Toni Morrison n'y figure pas non plus : son cas relève de l'item \"3 bâtiments sans géométrie fiable\" ci-dessous, pas d'un simple vitrage manquant.",
  },
  {
    titre: "3 bâtiments sans géométrie fiable",
    description:
      "Claude Lévi-Strauss, Toni Morrison, Marguerite Duras : mauvaise correspondance détectée lors du rapprochement RNB/APUR (hauteur mesurée incohérente avec le nombre d'étages connu), ou aucun document exploitable trouvé. Exclus plutôt que d'afficher une donnée probablement fausse.",
  },
  {
    titre: "Apport solaire final (kWh/an) disponible pour 5 bâtiments seulement",
    description:
      "Hélène Berr, Gutenberg, Jean-Pierre Melville, Oscar Wilde, Buffon (ajouté le 16/10) ont le calcul complet (géométrie + vitrage + irradiance corrigée des masques solaires). Les autres bâtiments qualifiés géométriquement n'ont pas encore de vitrage, donc pas de calcul final possible. Détail dans BILAN_COURBES_HELIOTROPIQUES.md.",
  },
  {
    titre: "Détection climatisation : un signal de facture, pas une cause confirmée",
    description:
      "L'onglet \"Consommation mensuelle\" signale une climatisation probable quand l'électricité grimpe l'été (Marguerite Duras, Toni Morrison) — mais aucun document ne confirme quel équipement produit cette hausse pour ces deux bâtiments. À l'inverse, Jean-Pierre Melville a un équipement documenté capable de refroidir (rooftop/PAC) sans aucun signal sur facture. Un vrai contrat de maintenance CVC (pas trouvé à ce jour) serait nécessaire pour relier les deux.",
  },
  {
    titre: "DPE de 2009 utilisés pour le score Risque, légalement expirés depuis 2022",
    description:
      "Buffon (G), Hélène Berr (C), François Villon (E), Colette Vivier (C), Toni Morrison (E), Jean-Pierre Melville (C), Mohammed Arkoun (C) : la lettre DPE vient du même document \"DPE — Relevés thermiques et constructifs (2009)\" dont on a déjà prouvé que la consommation associée était obsolète (voir le recalcul de conso_mesuree_kwh_m2). Un DPE réalisé avant 2013 est légalement expiré depuis le 31/12/2022 (réforme DPE de 2021, durée de validité raccourcie pour les anciennes méthodes de calcul) — ce n'est pas qu'une donnée ancienne, c'est une donnée hors de validité réglementaire. `scoreRisque()` (lib/api.ts) l'utilise pourtant à 50 % de son calcul, faute d'alternative : aucun nouveau DPE n'a été commandé pour ces 7 bâtiments à ce jour.",
  },
  {
    titre: "Volume 3D disponible pour 7 bâtiments sur 11",
    description:
      "Buffon, Oscar Wilde, Hélène Berr, François Villon, Gutenberg, Colette Vivier, Jean-Pierre Melville uniquement (géométrie RNB/APUR vérifiée). Le contour n'est pas stocké tel quel : il est reconstruit à partir des longueurs et orientations de façade, avec une fermeture testée entre 0 et 5,6 % du périmètre selon le bâtiment — suffisant visuellement, pas pour du calcul. Toiture plate simplifiée (pas de relevé réel), position du soleil limitée aux 2 solstices (pas de course continue ni de correction d'équation du temps).",
  },
];

export default function EtatDuProjetPage() {
  return (
    <>
      <div className="crumb">État du système</div>
      <div className="h1">
        État du système <small>Ce qui reste en mode démo ou à corriger — page interne, non destinée à la présentation</small>
      </div>
      <div className="panel">
        <div className="content" style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {items.map((item) => (
            <div key={item.titre} style={{ border: "1px solid #E1E9EC", borderRadius: 7, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{item.titre}</div>
              <div style={{ fontSize: 12.5, color: "#4A5C65", lineHeight: 1.5 }}>{item.description}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
