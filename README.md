# HRFlow — NovaTech ShipIt

Plateforme RH en architecture microservices (gestion de l'auth, de la paie, des congés et du recrutement), avec un frontend React et une API Gateway en point d'entrée unique.

## Architecture

Le projet est découpé en 5 services Node.js/Express, chacun avec sa propre base de responsabilité :

| Service | Rôle | Port |
|---|---|---|
| `api-gateway` | Point d'entrée unique, reverse-proxy vers les autres services, vérification des JWT, CORS | 3000 |
| `auth` | Authentification, gestion des utilisateurs, émission des JWT | 3001 |
| `paie` | Calcul et gestion des bulletins de paie | 3002 |
| `conges` | Gestion des demandes de congés, feature flags (Unleash) | 3003 |
| `recrutement` | Gestion des candidatures | 3004 |

Tous les services (sauf `recrutement` en mode mock) partagent une base **PostgreSQL** unique.

Pour le détail des schémas et des flux entre services, voir [`docs/architecture.md`](docs/architecture.md).

## Prérequis

- [Docker](https://docs.docker.com/get-docker/) et [Docker Compose](https://docs.docker.com/compose/)
- [Node.js 20](https://nodejs.org/) (pour lancer les tests ou développer un service hors conteneur)

## Lancer le projet en local

```bash
cp .env.example .env   # à adapter si besoin, les valeurs par défaut suffisent en dev
docker compose up --build
```

Cela démarre PostgreSQL et les 5 services. Une fois lancés :

| Service | URL locale |
|---|---|
| API Gateway | http://localhost:3000 |
| Auth | http://localhost:3001 |
| Paie | http://localhost:3002 |
| Congés | http://localhost:3003 |
| Recrutement | http://localhost:3004 |
| PostgreSQL | localhost:5432 |

Le frontend (React, `react-scripts`) se lance séparément depuis le dossier `frontend/` :

```bash
cd frontend
npm install
npm start
```

## Tests

Chaque service embarque ses propres tests (Jest, + Playwright pour les tests e2e de `recrutement`). Depuis le dossier d'un service :

```bash
cd services/<service>
npm install
npm test
```

La couverture de code est vérifiée automatiquement en CI (`npm run test:coverage` quand disponible). Le service `paie` impose un seuil minimum de couverture (80% lignes / 75% branches / 75% fonctions).

## CI/CD

Le pipeline GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) se déclenche sur push et pull request vers `main` et `develop`, et comporte :

1. **Build** — pour chacun des 5 services : installation des dépendances, vérification de la syntaxe, exécution des tests et de la couverture.
2. **Security** — audit des dépendances (`npm audit`) et scan de l'image Docker de chaque service avec [Trivy](https://github.com/aquasecurity/trivy) (sévérités HIGH/CRITICAL, non bloquant pour l'instant).
3. **health-check-render** — uniquement sur push vers `develop` : après le déploiement Render, vérifie que l'API Gateway, le service Auth et le frontend répondent (`/health`).

## Déploiement

Le déploiement se fait automatiquement sur [Render](https://render.com), à partir de la branche `develop`, via [`render.yaml`](render.yaml) (Render Blueprint). Chaque service (auth, api-gateway, paie, congés, recrutement), le frontend et la stack de monitoring (Prometheus, Grafana, Alertmanager) sont déployés comme services Render distincts, avec une base PostgreSQL managée partagée.

> Les URLs Render réelles sont définies dans `render.yaml` et dans le pipeline CI (`<service>-dev-4xk1.onrender.com`) 

## Monitoring

La stack d'observabilité repose sur **Prometheus**, **Grafana** et **Alertmanager** :

- En local : `docker-compose.monitoring.yml` lance Prometheus (`:9090`), Alertmanager (`:9094`) et Grafana (`:3033`, identifiants par défaut `admin` / voir `GRAFANA_PASSWORD`).
- Sur Render : déployés comme services séparés définis dans `render.yaml` (configuration dans `monitoring/render/`).
- Les règles d'alerte sont dans [`monitoring/alerts.yml`](monitoring/alerts.yml), la config Prometheus dans [`monitoring/prometheus.yml`](monitoring/prometheus.yml).
- Les services `auth` et `paie` exposent un endpoint `/metrics` au format Prometheus ; tous les services exposent `/health` (sauf `recrutement`, à vérifier).

## Documentation

- [`docs/audit-equipe.md`](docs/audit-equipe.md) — audit des problèmes identifiés par l'équipe, priorisés par sévérité.
- [`docs/plan-remediation.md`](docs/plan-remediation.md) — plan de remédiation détaillant les corrections apportées.
- [`docs/architecture.md`](docs/architecture.md) — schémas et détail de l'architecture.



---
*Dernière mise à jour : août 2026*
