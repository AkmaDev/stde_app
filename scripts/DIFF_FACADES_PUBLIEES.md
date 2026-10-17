# Diff facades publiees vs sortie fraiche du pipeline

Genere par `diff_facades_publiees.py` -- AUCUNE fusion n'a ete faite, ce fichier
sert de reference avant d'en faire une. La numerotation des facades change d'une
republication APUR a l'autre (`normalize()`) -- ne jamais fusionner par egalite
d'index, toujours via `apparier_facades_par_geometrie()`.

**Total : 42 facade(s) porteuse(s) de donnees, 3 non appariee(s).**


## Batiment 2 (4 facade(s) porteuse(s))

| Ancien index | Nouvel index | Donnee |
|---|---|---|
| 0 | 2 | Façade vérifiée comme mitoyenne le 03/09/2026 : distance mes... |
| 1 | 1 | Vitrage estimé à partir des plans de façade réels (Cabinet G... |
| 3 | 0 | Façade vérifiée comme mitoyenne le 03/09/2026 : distance mes... |
| 4 | 3 | Vitrage estimé à partir des plans de façade réels (Cabinet G... |

## Batiment 7 (4 facade(s) porteuse(s))

| Ancien index | Nouvel index | Donnee |
|---|---|---|
| 0 | 1 | Estimation basee sur un plan d'elevation trouve dans le doss... |
| 1 | 0 | Estimation basee sur un plan d'elevation trouve dans le doss... |
| 2 | 3 | Estimation basee sur un plan d'elevation trouve dans le doss... |
| 3 | 2 | irradiance=658.5 kWh/m2/an |

## Batiment 9 (8 facade(s) porteuse(s))

| Ancien index | Nouvel index | Donnee |
|---|---|---|
| 0 | 4 | irradiance=547.7 kWh/m2/an |
| 1 | 3 | irradiance=1054.4 kWh/m2/an |
| 2 | 2 | irradiance=951.5 kWh/m2/an |
| 3 | 1 | irradiance=1058.8 kWh/m2/an |
| 4 | 0 | irradiance=953.8 kWh/m2/an |
| 5 | 13 | Attribution à la façade Picpus incertaine — meilleure hypoth... |
| 17 | 6 | irradiance=556.9 kWh/m2/an |
| 18 | 5 | irradiance=422.3 kWh/m2/an |

## Batiment 11 (9 facade(s) porteuse(s))

| Ancien index | Nouvel index | Donnee |
|---|---|---|
| 0 | 5 | irradiance=460.2 kWh/m2/an |
| 1 | **NON APPARIEE** | irradiance=958.3 kWh/m2/an |
| 2 | **NON APPARIEE** | irradiance=937.1 kWh/m2/an |
| 3 | 2 | irradiance=797.5 kWh/m2/an |
| 4 | 1 | irradiance=1081.9 kWh/m2/an |
| 5 | 0 | irradiance=763.4 kWh/m2/an |
| 6 | 9 | irradiance=671.3 kWh/m2/an |
| 7 | 8 | irradiance=606.8 kWh/m2/an |
| 8 | 7 | irradiance=537.8 kWh/m2/an |

## Batiment 12 (4 facade(s) porteuse(s))

| Ancien index | Nouvel index | Donnee |
|---|---|---|
| 0 | 1 | Vitrage extérieur estimé très faible : le dossier de plans i... |
| 1 | 0 | Vitrage extérieur estimé très faible : le dossier de plans i... |
| 2 | 3 | Vitrage extérieur estimé très faible : le dossier de plans i... |
| 3 | 2 | Vitrage extérieur estimé très faible : le dossier de plans i... |

## Batiment 13 (5 facade(s) porteuse(s))

| Ancien index | Nouvel index | Donnee |
|---|---|---|
| 0 | 3 | irradiance=469.1 kWh/m2/an |
| 1 | 2 | irradiance=1029.8 kWh/m2/an |
| 2 | 1 | irradiance=1012.7 kWh/m2/an |
| 3 | 0 | irradiance=783.4 kWh/m2/an |
| 4 | 4 | irradiance=491.3 kWh/m2/an |

## Batiment 16 (8 facade(s) porteuse(s))

| Ancien index | Nouvel index | Donnee |
|---|---|---|
| 4 | 2 | Estimation basée sur les élévations réelles (dossier 2_Plans... |
| 5 | 1 | Calculé (pas estimé à l'œil) à partir des cotes réelles du p... |
| 6 | 0 | Estimation basée sur l'élévation Sud-Ouest réelle (même doss... |
| 8 | 17 | Estimation basée sur les élévations réelles (dossier 2_Plans... |
| 10 | 14 | Estimation basée sur les élévations réelles (dossier 2_Plans... |
| 11 | **NON APPARIEE** | Estimation basée sur les élévations réelles (dossier 2_Plans... |
| 12 | 12 | Estimation basée sur les élévations réelles (dossier 2_Plans... |
| 13 | 11 | Estimation basée sur les élévations réelles (dossier 2_Plans... |

