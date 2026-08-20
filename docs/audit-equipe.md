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

## Paie & Infra Terraform (à compléter)

_À compléter par la responsable de ce lot._

## Congés & Feature Flags (à compléter)

_À compléter par la responsable de ce lot._

## Recrutement & Documentation (à compléter)

_À compléter par la responsable de ce lot._
