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

## Paie & Infra Terraform (Liza)

- **Auth contournable (#17)** : vérification du JWT ajoutée directement dans le service paie sur `/paie/calculer` et `/paie/heures-sup`, pour ne plus dépendre uniquement du gateway (défense en profondeur — le service reste protégé même si on le contourne).
- **Doublons sur /paie/calculer (#18)** : vérification qu'un bulletin n'existe pas déjà pour l'employé/mois avant calcul, retour 409 sinon — évite qu'un retry ou un double-clic ne recrée un bulletin et ne redéclenche un virement Stripe.
- **Échec de virement Stripe silencieux (#19)** : ajout d'un statut `virementStatut`/`virementErreur` sur le bulletin, réponse 502 en cas d'échec (au lieu de 200), ajout de la métrique `paie_virement_echecs_total` pour l'alerting.
- **Route /paie/migrate dangereuse (#20)** : route retirée — les colonnes qu'elle ajoutait via `ALTER TABLE` étaient déjà présentes dans `db/init.sql` et non utilisées ailleurs dans le code ; documentation OpenAPI et runbook mis à jour en conséquence.
- **Validation des champs (#21)** : ajout de validations sur `employeeId`, `mois`/`annee`, `heures` avant tout calcul, 400 sinon.

Côté Terraform (non déployé, reste à faire avant un éventuel retour vers AWS) :

- **DATABASE_URL incorrecte sur les tâches ECS (#22)** : à corriger dans `terraform/ecs.tf`/`terraform/secrets.tf` — construire la chaîne de connexion complète (host, port, base, utilisateur, mot de passe) plutôt que de pointer uniquement vers le secret du mot de passe. Non bloquant tant que l'infra reste sur Render, mais bloquant en cas de retour vers AWS.
- **Pas de HTTPS sur le load balancer (#23)** : à ajouter dans `terraform/alb.tf` — listener 443 avec certificat ACM, redirection du port 80 vers le 443. Même remarque : à faire avant tout retour vers AWS.

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

## Recrutement & Documentation

- **Validation des candidatures** : ajout d'un contrôle des champs obligatoires (`nom`, `prenom`, `email`, `poste`) avant l'insertion en base, avec retour HTTP `400` en cas de donnée manquante.
  
- **Validation des CV** : ajout d'un contrôle de présence du fichier CV avant traitement, avec retour HTTP `400` lorsqu'aucun CV n'est fourni.
  
- **Gestion des erreurs PostgreSQL** : ajout de blocs `try/catch` autour des opérations de création, consultation et mise à jour afin de retourner une réponse HTTP `500` contrôlée en cas d'erreur.
  
- **Gestion des candidatures inexistantes** : ajout d'un retour HTTP `404` lorsqu'une candidature ciblée pour une mise à jour n'existe pas.
  
- **Validation du statut** : ajout d'un contrôle empêchant la mise à jour d'une candidature avec un statut vide.
  
- **Tests unitaires** : ajout de tests Jest/Supertest couvrant les principales routes du service Recrutement ainsi que les cas d'erreur liés aux validations, à la base de données et aux candidatures inexistantes.
  
- **Tests End-to-End** : ajout de scénarios Playwright couvrant la création d'une candidature, la consultation des candidatures, la mise à jour du statut, l'upload d'un CV et les erreurs de validation.
  
- **Tests sans dépendance à PostgreSQL** : ajout du mode `MOCK_DB=true` afin de permettre l'exécution locale des tests dans un environnement contrôlé et reproductible.
  
- **Observabilité** : ajout des endpoints `/health` et `/metrics` ainsi que des métriques HTTP `http_requests_total` et `http_request_duration_seconds` avec `prom-client`, afin d'intégrer le service au monitoring Prometheus/Grafana.
  
- **Documentation API** : ajout et mise à jour de la documentation OpenAPI/Swagger afin de documenter les endpoints, paramètres et réponses des services.
  
- **Documentation projet** : enrichissement du `README.md` avec les instructions d'installation, d'exécution, de test, de CI/CD, de déploiement et de monitoring.
  
- **Configuration** : ajout d'un fichier `.env.example` permettant de documenter les variables d'environnement nécessaires sans exposer de secrets.
  
- **Gestion des incidents** : ajout d'un runbook documentant les procédures de diagnostic, de correction et de rollback en cas d'incident.
