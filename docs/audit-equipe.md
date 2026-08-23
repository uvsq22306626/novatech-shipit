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

## Paie & Infra Terraform (à compléter)

_À compléter par la responsable de ce lot._

## Congés & Feature Flags

| # | Problème | Sévérité | Fichier | Statut |
|---|----------|----------|---------|--------|
| 17| Endpoint de debug `/conges/debug/all` exposant les congés et les données employés sans contrôle d'accès | 🔴 Critique | services/conges/src/index.js | ✅ Corrigé |
| 18 | Absence de gestion des erreurs PostgreSQL pouvant provoquer des erreurs non maîtrisées | 🟠 Élevée | services/conges/src/index.js | ✅ Corrigé |
| 19 | Absence de validation des champs obligatoires lors de la création d'une demande de congé | 🟠 Élevée | services/conges/src/index.js | ✅ Corrigé |
| 20 | Absence de validation des dates (dates invalides ou date de fin antérieure à la date de début) | 🟠 Élevée | services/conges/src/index.js | ✅ Corrigé |
| 21 | Calcul incorrect du nombre de jours de congé : le premier jour n'était pas inclus | 🟡 Moyenne | services/conges/src/index.js | ✅ Corrigé |
| 22 | Absence de réponse `404` lorsqu'un employé demandé n'existe pas | 🟡 Moyenne | services/conges/src/index.js | ✅ Corrigé |
| 23 | Absence de tests automatisés et de mesure de couverture pour le service Congés | 🟠 Élevée | services/conges/tests/ | ✅ Corrigé |
| 24 | Aucun mécanisme de Feature Flag permettant d'activer/désactiver une fonctionnalité sans redéploiement | 🟡 Moyenne | services/conges/src/config/unleash.js | ✅ Corrigé |
| 25 | Approbation des congés non pilotable dynamiquement selon la durée de la demande | 🟡 Moyenne | services/conges/src/app.js | ✅ Corrigé |
| 26 | Service Congés non exposé aux outils de monitoring via un endpoint `/metrics` | 🟡 Moyenne | services/conges/src/app.js | 🚧 En cours |
| 27 | Documentation OpenAPI/Swagger du service Congés absente | 🟡 Moyenne | docs/ | 🚧 À faire |
| 28 | Aucun scénario E2E Playwright couvrant le parcours Congés | 🟡 Moyenne | tests/e2e/ | 🚧 À faire |


## Recrutement & Documentation (à compléter)

_À compléter par la responsable de ce lot._
