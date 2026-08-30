# Audit d'équipe — ShipIt / NovaTech HRFlow

Liste priorisée des problèmes identifiés, par domaine.

## Auth & API Gateway (Douaa)

| # | Problème | Sévérité | Fichier | Statut |
|---|----------|----------|---------|--------|
| 1 | Injection SQL sur la route de login (requête concaténée) | 🔴 Critique | services/auth/src/index.js | ✅ Corrigé |
| 2 | Secrets en dur (JWT_SECRET, mot de passe DB) + logués en clair | 🔴 Critique | services/auth/src/index.js | ✅ Corrigé |
| 3 | Middleware d'authentification jamais branché sur les routes sensibles | 🔴 Critique | services/api-gateway/src/index.js | ✅ Corrigé |
| 4 | CORS totalement ouvert (`Access-Control-Allow-Origin: *`) | 🟠 Élevée | services/api-gateway/src/index.js | ✅ Corrigé |
| 5 | Stack trace complète renvoyée au client en cas d'erreur | 🟠 Élevée | services/api-gateway/src/index.js | ✅ Corrigé |
| 6 | Log applicatif exposant email + rôle utilisateur en clair | 🟡 Moyenne | services/auth/src/index.js | ✅ Corrigé |
| 7 | Commentaire obsolète laissant penser le middleware désactivé | 🟢 Faible | services/api-gateway/src/middleware/auth.js | ✅ Corrigé |

## Pipeline CI/CD & Sécurité (Douaa)

| # | Problème | Sévérité | Statut |
|---|----------|----------|--------|
| 8 | Aucun scan de sécurité (dépendances / image Docker) dans le pipeline | 🟠 Élevée | ✅ Corrigé (stage Security ajouté) |
| 9 | Scan de sécurité limité au seul service Auth | 🟡 Moyenne | 🚧 En cours (extension aux 4 autres services) |
| 10 | Aucun Dockerfile pour api-gateway, paie, congés | 🟠 Élevée | ✅ Corrigé |
| 11 | Aucun environnement de test local reproductible (pas de docker-compose) | 🟡 Moyenne | ✅ Corrigé |
| 12 | Absence de stage Deploy dans le pipeline | 🟠 Élevée | 🚧 En cours |
| 13 | Déploiement AWS/Terraform trop lourd pour le délai imparti | 🟡 Moyenne | ✅ Corrigé (pivot vers Render) |
| 14 | Aucune vérification automatique après déploiement | 🟠 Élevée | ✅ Corrigé (stage health-check-render) |
| 15 | Pipeline ne se déclenchait pas sur develop (branche de déploiement réelle) | 🔴 Critique | ✅ Corrigé |
| 16 | Service Auth sans endpoint /metrics ni /health | 🟡 Moyenne | ✅ Corrigé |

## Paie & Infra Terraform (Liza)

| # | Problème | Sévérité | Fichier | Statut |
|---|----------|----------|---------|--------|
| 17 | Le service paie est exposé publiquement sur Render, sans vérification d'auth dans le service lui-même — seul le gateway vérifie le JWT, donc on peut appeler `/paie/calculer` ou `/paie/migrate` directement en contournant le gateway | 🔴 Critique | services/paie/src/index.js | ✅ Corrigé (vérification JWT ajoutée directement dans le service sur `/paie/calculer` et `/paie/heures-sup`) |
| 18 | Pas de protection contre les doublons sur `/paie/calculer` : un rejeu (retry, double-clic) recrée un bulletin et redéclenche un virement Stripe pour le même employé/mois | 🔴 Critique | services/paie/src/index.js | ✅ Corrigé (vérification d'un bulletin existant avant calcul, 409 si déjà généré) |
| 19 | Si le virement Stripe échoue, l'erreur est juste loguée et ignorée — le bulletin reste renvoyé comme "réussi" (200), sans alerte dédiée (seule l'alerte `PaieServiceDown` existe) | 🟠 Élevée | services/paie/src/index.js | ✅ Corrigé (statut `virementStatut`/`virementErreur` dans le bulletin, réponse 502 si échec, métrique `paie_virement_echecs_total` ajoutée) |
| 20 | La route `/paie/migrate` exécute des `ALTER TABLE` en dur, protégée seulement par une clé statique en dur dans une variable d'env | 🟡 Moyenne | services/paie/src/index.js | ✅ Corrigé (route retirée — colonnes déjà présentes dans `db/init.sql`, non utilisées ailleurs dans le code ; doc OpenAPI et runbook mis à jour) |
| 21 | Aucune validation des champs reçus (`employeeId`, `mois`, `heures`...) avant de les utiliser dans les calculs | 🟡 Moyenne | services/paie/src/index.js | ✅ Corrigé (validation `employeeId`, `mois`/`annee`, `heures` avant tout calcul, 400 sinon) |

Côté Terraform (module jamais réellement déployé — voir point #13, crédit AWS promis par l'école jamais reçu, d'où le pivot vers Render) :

| # | Problème | Sévérité | Fichier | Statut |
|---|----------|----------|---------|--------|
| 22 | La variable `DATABASE_URL` des tâches ECS pointe vers le secret du mot de passe seul, pas vers une vraie chaîne de connexion — si on avait déployé sur AWS, les services n'auraient pas pu se connecter à la base | 🟠 Élevée | terraform/ecs.tf, terraform/secrets.tf | ❌ Non corrigé |
| 23 | Seul un listener HTTP (port 80) est configuré sur le load balancer, pas de HTTPS/certificat | 🟡 Moyenne | terraform/alb.tf | ❌ Non corrigé |

## Congés & Feature Flags

| # | Problème | Sévérité | Fichier | Statut |
|---|----------|----------|---------|--------|
| 17 | Endpoint de debug `/conges/debug/all` exposant les congés et les données employés sans contrôle d'accès | 🔴 Critique | services/conges/src/index.js | ✅ Corrigé |
| 18 | Absence de gestion des erreurs PostgreSQL pouvant provoquer des erreurs non maîtrisées | 🟠 Élevée | services/conges/src/index.js | ✅ Corrigé |
| 19 | Absence de validation des champs obligatoires lors de la création d'une demande de congé | 🟠 Élevée | services/conges/src/index.js | ✅ Corrigé |
| 20 | Absence de validation des dates (dates invalides ou date de fin antérieure à la date de début) | 🟠 Élevée | services/conges/src/index.js | ✅ Corrigé |
| 21 | Calcul incorrect du nombre de jours de congé : le premier jour n'était pas inclus | 🟡 Moyenne | services/conges/src/index.js | ✅ Corrigé |
| 22 | Absence de réponse `404` lorsqu'un employé demandé n'existe pas | 🟡 Moyenne | services/conges/src/index.js | ✅ Corrigé |
| 23 | Absence de tests automatisés et de mesure de couverture pour le service Congés | 🟠 Élevée | services/conges/tests/ | ✅ Corrigé |
| 24 | Aucun mécanisme de Feature Flag permettant d'activer/désactiver une fonctionnalité sans redéploiement | 🟡 Moyenne | services/conges/src/config/unleash.js | ✅ Corrigé |
| 25 | Approbation des congés non pilotable dynamiquement selon la durée de la demande | 🟡 Moyenne | services/conges/src/app.js | ✅ Corrigé |
| 26 | Service Congés non exposé aux outils de monitoring via un endpoint `/metrics` | 🟡 Moyenne | services/conges/src/app.js | ✅ Corrigé |
| 27 | Documentation OpenAPI/Swagger du service Congés absente | 🟡 Moyenne | services/conges/src/docs/openapi.yaml | ✅ Corrigé |
| 28 | Aucun scénario E2E Playwright couvrant le parcours Congés | 🟡 Moyenne | services/conges/e2e/ | ✅ Corrigé |

## Recrutement & Documentation (à compléter)

_À compléter par la responsable de ce lot._
