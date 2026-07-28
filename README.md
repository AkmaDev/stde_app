# SDTE — Fondation applicative

Prototype interactif du Schéma Directeur de Transition Écologique des Bâtiments Culturels (DAC, Ville de Paris). Reprend les 4 vues du cahier des charges (Vision parc, Indicateurs globaux, Détail bâtiment, Comparateur de leviers), déjà maquettées en HTML statique à la racine du dossier de travail.

## Ce que c'est — et ce que ce n'est pas

- **Données** : 10 bâtiments de démonstration (repris des mockups + audit réel de la bibliothèque Andrée Chedid). Pas les données réelles du parc DAC.
- **Moteur** : pas de moteur de calcul thermique physique (décision actée le 24/07 — trop complexe vu les paramètres inconnus sur l'existant). Le score et les gains de leviers sont un **squelette de "moteur d'analyse" statistique** (références ADEME documentées, écrêtement des gains combinés), à recalibrer une fois des jeux de données réels avant/après travaux disponibles (~20 minimum évoqués).
- Bandeau "JEU DE DÉMONSTRATION" affiché sur chaque page tant que les données sont fictives.

## Architecture

- `backend/` — API FastAPI + SQLModel (Pydantic + SQLite). Voir `backend/app/scoring.py` pour la logique de score.
- `frontend/` — Next.js (App Router, TypeScript). 4 pages calquées sur les mockups.

## Lancer en local

### Backend

```bash
cd backend
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # Windows
uvicorn app.main:app --reload --port 8000
```

La base SQLite (`stde.db`) est créée et peuplée automatiquement au premier démarrage.

Endpoints : `GET /batiments`, `GET /batiments/{id}`, `GET /leviers`, `GET /leviers/{id}/batiments`, `GET /indicateurs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Ouvrir http://localhost:3000. Le frontend attend le backend sur `http://127.0.0.1:8000` (configurable via `NEXT_PUBLIC_API_URL`).

## Limite de sécurité connue

`next@14.2.35` (dernier correctif de la branche 14.x) reste vulnérable à un SSRF via `rewrites` et à une divulgation d'endpoints Server Functions internes (corrigés seulement en `next@16`, qui impose React 19 et des changements de rupture). L'app n'utilise ni `rewrites` ni Server Actions, et reste en local pour l'instant — risque jugé faible à ce stade, mais à réévaluer avant tout déploiement exposé.

## Hors périmètre à ce stade

- Upload/gestion de fichiers (PDF, images) par bâtiment.
- Calibration réelle du moteur d'analyse (attend les jeux de données réels).
- Authentification, hébergement DSI, déploiement.
