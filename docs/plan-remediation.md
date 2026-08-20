# Plan de remédiation — ShipIt / NovaTech HRFlow

## Auth & API Gateway (Douaa)

- **Injection SQL** : remplacement des requêtes concaténées par des requêtes paramétrées (`$1`, `$2`...).
- **Secrets en dur** : suppression des valeurs par défaut hardcodées, ajout d'un refus de démarrage si `JWT_SECRET` absent.
- **Middleware d'auth** : branché sur toutes les routes sensibles (`/api/paie`, `/api/conges`, `/api/recrutement`).
- **CORS** : restreint à une whitelist configurable via `ALLOWED_ORIGINS`.
- **Erreurs internes** : les stack traces ne sont plus renvoyées au client, message générique à la place.
- **Log sensible** : suppression du log exposant email + rôle en clair.

## Pipeline CI/CD & Sécurité (Douaa)

- **Stage Security** : ajout de `npm audit` + scan Trivy sur l'image Docker, en mode non bloquant (`|| true`, `exit-code: 0`) pour ne pas casser le pipeline pendant la phase de stabilisation. Passage en mode bloquant à envisager en fin de projet.
- **Extension aux autres services** : ajout des Dockerfiles manquants (api-gateway, paie, congés), passage du job Security en matrice pour couvrir les 5 services.
- **Environnement reproductible** : ajout d'un `docker-compose.yml` avec Postgres + les 5 services, pour permettre des tests locaux fiables avant tout déploiement.
- **Stage Deploy** : à venir, en coordination avec l'infra Terraform (branchement automatique une fois l'infra provisionnée).

## Paie & Infra Terraform (à compléter)

_À compléter par la responsable de ce lot._

## Congés & Feature Flags (à compléter)

_À compléter par la responsable de ce lot._

## Recrutement & Documentation (à compléter)

_À compléter par la responsable de ce lot._
