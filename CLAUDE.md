# Règles du projet SDTE (stde_app)

Objectif : **zéro erreur silencieuse**. Le risque zéro n'existe pas (les sources APUR/RNB changent sans prévenir), mais toute anomalie doit soit bloquer, soit être signalée. Une donnée fausse marquée « vérifiée » est le pire résultat possible.

Ces règles s'appliquent à tout le dépôt, en priorité aux scripts de données (`scripts/`) et aux fichiers publiés (`frontend/data/`).

## 1. Données

- **Jamais de donnée inventée.** Toute valeur sans source retrouvable est retirée ou étiquetée « hypothèse », jamais présentée comme « documentée ».
- **Dans le doute, on bloque.** En cas d'incertitude, aucun fichier de sortie n'est écrit et le script se termine avec un code ≠ 0. « Vérifié » n'est jamais une valeur par défaut.
- **Aucune écriture automatique dans les entrées validées par un humain** (`manual_selection.json`, `frontend/data/`). Une réparation automatique est écrite dans un fichier de propositions séparé (ex. `*_proposed.json`), avec l'ancienne valeur, la nouvelle et la preuve. Elle n'est appliquée qu'après validation explicite de l'utilisateur.
- **Les identifiants externes ne sont pas des clés stables.** OBJECTID APUR, position dans une liste RNB, numéro de façade : on identifie par le contenu (`rnb_id`, empreinte géométrique, géométrie de la façade), jamais par un rang ou un identifiant interne.

## 2. Logique de décision

- **Un statut n'est jamais forcé à la main.** Pas de `ok = True` après une réparation : la fonction de vérification est rappelée et rend le verdict.
- **Chaque source est vérifiée indépendamment.** Réparer une source (ex. APUR) ne dispense jamais de vérifier l'autre (ex. RNB).
- **Une correction traite la famille de cas, pas le cas signalé.** Avant de déclarer un bug corrigé, lister les combinaisons d'états possibles et les tester toutes. Exemple pour l'identité d'un bâtiment :
  - RNB : correct / ordre changé / `rnb_id` absent / index hors limites ;
  - APUR : correct / republié (OBJECTID changés) / OBJECTID réattribué à un autre bâtiment ;
  - soit 12 combinaisons, chacune avec son résultat attendu.

## 3. Tests

- **Toute nouvelle règle de décision (accepter, rejeter, réparer) arrive avec un test qui échoue sans elle.** Le prouver en désactivant la règle et en vérifiant qu'au moins un test échoue (test de mutation).
- **Un test appelle la vraie fonction**, celle qu'utilise le script, jamais une reconstruction de ses étapes internes.
- **L'oracle ne réutilise pas le code testé.** Exemple pour les façades : un point placé juste devant doit être hors du bâtiment, un point placé juste derrière doit être dedans (Shapely `contains`).
- **Pas de test qui passe sans rien vérifier.** Si une donnée manque, le test signale explicitement qu'il est ignoré (SKIP), il ne fait pas `return`.
- **Les contre-exemples trouvés deviennent des cas fixes**, en plus des tests aléatoires (Hypothesis), pour que leur détection ne dépende pas du hasard.
- **Les réglages sont surveillés** (tolérances, seuils) par au moins un cas de référence réel dont le résultat change si le réglage change.

## 4. Définition de « terminé »

Une modification n'est terminée que si :

1. tous les tests passent, avec l'interpréteur et les versions de `scripts/requirements.txt` ;
2. la matrice de scénarios de la section 2 passe ;
3. les mutations des règles modifiées sont toutes détectées ;
4. un diff des sorties avec les données publiées (`frontend/data/`) a été produit et présenté à l'utilisateur ;
5. le compte rendu dit ce qui a été testé, ce qui ne l'a pas été, et les limites restantes, sans affirmer plus que ce qui a été vérifié.

## 5. Environnement

- Les dépendances Python de `scripts/` sont déclarées avec des versions précises dans `scripts/requirements.txt`.
- Les scripts et les tests sont lancés avec le même interpréteur.

## 6. Code

- Les commentaires décrivent ce que fait le code et pourquoi, en quelques lignes. L'historique des bugs va dans les messages de commit, pas dans le code.
- Le code mort est supprimé, pas conservé « pour compatibilité ».
- Commits uniquement au nom d'AkmaDev, sans ligne `Co-Authored-By`.
