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
- **Pivot de déploiement** : l'infra AWS/Terraform initialement prévue a été remplacée par un déploiement sur Render (contrainte de temps + limitations du plan gratuit à un seul environnement partagé). Le déploiement se déclenche automatiquement sur push vers `develop`.
- **Vérification post-déploiement** : ajout d'un stage `health-check-render` qui attend la fin du déploiement Render puis vérifie que l'api-gateway, l'auth et le frontend répondent, pour détecter rapidement un déploiement cassé.
- **Observabilité** : ajout d'un endpoint `/metrics` (Prometheus) et `/health` sur le service Auth, cohérent avec le reste des services, pour alimenter le dashboard Grafana (golden signals).
- **Correction du déclencheur CI** : le pipeline ne se déclenchait initialement que sur `main` ; corrigé pour inclure aussi `develop`, la branche réellement utilisée pour le déploiement continu.

## Paie & Infra Terraform (à compléter)

_À compléter par la responsable de ce lot._

## Congés & Feature Flags

- **Suppression de l'endpoint de debug** : suppression de `/conges/debug/all`, qui permettait d'exposer l'ensemble des congés et des informations employés sans contrôle d'accès.

- **Gestion des erreurs PostgreSQL** : ajout de blocs `try/catch` autour des accès à la base de données. En cas d'erreur interne, l'API retourne désormais une réponse HTTP `500` contrôlée sans exposer les détails techniques au client.

- **Validation des demandes de congés** : ajout de contrôles sur les champs obligatoires (`employeeId`, `dateDebut`, `dateFin`, `motif`) avant toute insertion en base. Une requête incomplète retourne désormais une erreur HTTP `400`.

- **Validation des dates** : contrôle du format des dates et vérification que la date de fin est supérieure ou égale à la date de début. Les demandes contenant des dates incohérentes sont rejetées avec une erreur HTTP `400`.

- **Correction du calcul du nombre de jours** : modification du calcul afin d'inclure le premier jour de congé. Une demande du 1er au 3 septembre correspond désormais correctement à 3 jours et une demande sur une seule journée correspond à 1 jour.

- **Gestion des employés inexistants** : l'endpoint de consultation du solde retourne désormais une réponse HTTP `404` lorsqu'aucun employé ne correspond à l'identifiant fourni.

- **Tests automatisés** : ajout de tests Jest et Supertest couvrant les principaux comportements du service, les validations, les erreurs PostgreSQL et la logique liée au Feature Flag. Les tests utilisent des mocks PostgreSQL et Unleash afin de rester indépendants des services externes.

- **Couverture de tests** : ajout de la génération du coverage avec Jest. Lors de la validation locale, les 12 tests passent avec 100 % de couverture sur les statements, functions et lines, et 95,45 % sur les branches.

- **Intégration des tests dans la CI** : ajout de l'installation avec `npm ci`, de l'exécution des tests Jest et de la génération du coverage pour le service Congés dans GitHub Actions.

- **Feature Flags avec Unleash** : intégration d'Unleash afin de pouvoir activer ou désactiver dynamiquement une fonctionnalité sans modification du code ni redéploiement du service.

- **Approbation automatique des congés** : création du Feature Flag `conges-automatic-approval`. Lorsque le flag est désactivé, les demandes restent `en_attente`. Lorsqu'il est activé, les demandes de 3 jours ou moins sont automatiquement `approuve`, tandis que les demandes supérieures à 3 jours restent `en_attente`.

- **Validation du Feature Flag** : trois scénarios ont été vérifiés : flag OFF + 3 jours → `en_attente`, flag ON + 3 jours → `approuve`, flag ON + 4 jours → `en_attente`. Le changement du flag est pris en compte sans redémarrage du service.

- **Configuration sécurisée d'Unleash** : l'URL, le token API, le nom de l'application et l'environnement Unleash sont fournis via des variables d'environnement. Le fichier `.env` contenant les valeurs locales n'est pas versionné dans Git.

- **Environnement Unleash reproductible** : ajout d'un `docker-compose.unleash.yml` permettant de lancer localement Unleash et sa base PostgreSQL.

- **Observabilité** : ajout de l'endpoint `/metrics` avec `prom-client`. Le service Congés expose les métriques HTTP `http_requests_total` et `http_request_duration_seconds`, ainsi que les métriques Node.js par défaut, afin de permettre leur collecte par Prometheus et leur exploitation dans Grafana.

- **Documentation OpenAPI/Swagger** : ajout d'une documentation OpenAPI 3.0 pour le service Congés, exposée via Swagger UI sur `/api-docs`. Elle documente les endpoints métier du service ainsi que les endpoints techniques `/health` et `/metrics`.

- **Tests E2E** : ajout de 3 scénarios Playwright pour le service Congés couvrant le health check, le rejet d'une demande avec des champs obligatoires manquants et le rejet d'une demande dont la date de fin est antérieure à la date de début. Les 3 scénarios sont validés.

## Recrutement & Documentation (à compléter)

_À compléter par la responsable de ce lot._
