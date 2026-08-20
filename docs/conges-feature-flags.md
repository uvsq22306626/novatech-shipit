# Service Congés — Feature Flags avec Unleash

## 1. Présentation

Le service **Congés** fait partie de l'application NovaTech HRFlow.

Il permet notamment :

- de vérifier l'état du service ;
- de consulter le solde de congés d'un employé ;
- de créer une demande de congé ;
- d'activer dynamiquement l'approbation automatique des demandes courtes grâce à un Feature Flag.

La gestion des Feature Flags est réalisée avec **Unleash**.

L'objectif est de pouvoir modifier le comportement du service sans modifier le code et sans redéployer l'application.

---

## 2. Technologies utilisées

Le service utilise les technologies suivantes :

- Node.js
- Express
- PostgreSQL
- Jest
- Supertest
- Unleash
- Docker
- Docker Compose

---

## 3. API du service Congés

Le service Congés est exposé localement sur le port :

```text
3003
```

### 3.1 Health Check

**Endpoint :**

```http
GET /health
```

Cet endpoint permet de vérifier que le service Congés est disponible.

**Exemple de réponse :**

```json
{
  "status": "UP",
  "service": "conges"
}
```

---

### 3.2 Consulter le solde de congés

**Endpoint :**

```http
GET /conges/solde/:employeeId
```

Exemple :

```http
GET /conges/solde/1
```

Le service récupère :

- les jours de congés acquis ;
- les jours déjà pris ;
- les jours actuellement en attente.

Il calcule ensuite le solde restant.

**Exemple de réponse :**

```json
{
  "solde": 18,
  "joursAcquis": 25,
  "joursPris": 7,
  "joursEnAttente": 3
}
```

Si l'employé demandé n'existe pas, l'API retourne une erreur HTTP `404`.

---

### 3.3 Créer une demande de congé

**Endpoint :**

```http
POST /conges/demande
```

**Exemple de body :**

```json
{
  "employeeId": 1,
  "dateDebut": "2026-09-10",
  "dateFin": "2026-09-12",
  "motif": "Vacances"
}
```

Lors de la création d'une demande, le service vérifie :

- que tous les champs obligatoires sont présents ;
- que les dates sont valides ;
- que la date de fin est supérieure ou égale à la date de début ;
- le nombre de jours demandés ;
- l'état du Feature Flag Unleash.

Le nombre de jours est calculé en incluant le premier et le dernier jour.

---

## 4. Feature Flag Unleash

Le Feature Flag utilisé pour le service Congés est :

```text
conges-automatic-approval
```

Il permet d'activer ou de désactiver l'approbation automatique des demandes de congés courtes.

### Feature Flag désactivé

Lorsque `conges-automatic-approval` est désactivé, une demande de congé reste en attente.

Exemple :

```text
Feature Flag : OFF
Durée        : 3 jours
Statut       : en_attente
```

### Feature Flag activé

Lorsque le Feature Flag est activé, une demande de **3 jours ou moins** est automatiquement approuvée.

Exemple :

```text
Feature Flag : ON
Durée        : 3 jours
Statut       : approuve
```

Une demande supérieure à 3 jours n'est pas approuvée automatiquement.

Exemple :

```text
Feature Flag : ON
Durée        : 4 jours
Statut       : en_attente
```

---

## 5. Matrice de comportement

| Feature Flag | Nombre de jours | Résultat |
|---|---:|---|
| OFF | 3 jours | `en_attente` |
| ON | 3 jours | `approuve` |
| ON | 4 jours | `en_attente` |

Cette configuration permet d'activer ou de désactiver une fonctionnalité directement depuis Unleash sans modifier le code de l'application.

---

## 6. Configuration Unleash

Le service utilise les variables d'environnement suivantes :

```env
UNLEASH_URL=
UNLEASH_API_TOKEN=
UNLEASH_APP_NAME=
UNLEASH_ENVIRONMENT=
```

Les valeurs sensibles, notamment `UNLEASH_API_TOKEN`, ne doivent jamais être stockées directement dans le dépôt Git.

Le fichier `.env` local contenant les valeurs réelles est ignoré par Git.

---

## 7. Lancement local d'Unleash

Un environnement Unleash local est fourni avec :

```text
docker-compose.unleash.yml
```

Il contient notamment :

- un serveur Unleash ;
- une base PostgreSQL utilisée par Unleash.

Pour démarrer l'environnement :

```bash
docker compose -f docker-compose.unleash.yml up -d
```

Pour vérifier les conteneurs :

```bash
docker compose -f docker-compose.unleash.yml ps
```

L'interface Unleash est ensuite accessible localement sur le port :

```text
4242
```

Le Feature Flag `conges-automatic-approval` peut être activé ou désactivé pour l'environnement `development`.

---

## 8. Tests automatisés

Les tests du service Congés utilisent :

- Jest ;
- Supertest ;
- un mock PostgreSQL ;
- un mock du client Unleash.

Le serveur Unleash réel n'est donc pas nécessaire pendant l'exécution des tests unitaires.

Les principaux scénarios testés sont :

1. vérification du endpoint `/health` ;
2. consultation du solde d'un employé ;
3. retour `404` pour un employé inexistant ;
4. gestion d'une erreur PostgreSQL ;
5. création d'une demande valide ;
6. calcul d'une demande d'une seule journée ;
7. validation des champs obligatoires ;
8. validation du format des dates ;
9. validation de l'ordre des dates ;
10. gestion d'une erreur PostgreSQL lors de l'insertion ;
11. Feature Flag OFF : demande courte en attente ;
12. Feature Flag ON : approbation automatique d'une demande courte ;
13. Feature Flag ON avec demande supérieure à 3 jours : maintien en attente.

Les scénarios Feature Flag principaux validés sont :

```text
OFF + 3 jours
→ en_attente

ON + 3 jours
→ approuve

ON + 4 jours
→ en_attente
```

---

## 9. Exécution des tests

Depuis le dossier :

```text
services/conges
```

Les tests peuvent être lancés avec :

```bash
npm test
```

La couverture peut être générée avec :

```bash
npm run test:coverage
```

Lors de la validation locale de la fonctionnalité, les résultats obtenus étaient :

```text
Tests       : 12 passed
Statements  : 100 %
Branches    : 95.45 %
Functions   : 100 %
Lines       : 100 %
```

---

## 10. Intégration dans la CI

Le service Congés est intégré dans la CI GitHub Actions.

Pour le service Congés, la CI effectue notamment :

```bash
npm ci
npm test
npm run test:coverage
```

Cela permet de vérifier automatiquement les tests et la couverture lors de l'intégration du code.

Les tests utilisent un mock du client Unleash. Aucun token Unleash réel n'est donc nécessaire pour les tests de CI.

Les secrets Unleash seront configurés séparément pour les environnements de déploiement et de staging.

---

## 11. Sécurité

Les secrets Unleash ne sont pas versionnés dans Git.

En particulier, la valeur réelle de :

```text
UNLEASH_API_TOKEN
```

doit être fournie via une variable d'environnement ou un secret de l'environnement de déploiement.

Aucun token Unleash ne doit être écrit directement dans :

- le code source ;
- le fichier de documentation ;
- le Docker Compose versionné ;
- le dépôt Git.

---

## 12. Résultat

L'intégration du Feature Flag permet de modifier dynamiquement le comportement du service Congés.

Les tests manuels ont permis de vérifier les trois comportements suivants :

| Configuration | Résultat |
|---|---|
| Flag OFF + demande de 3 jours | `en_attente` |
| Flag ON + demande de 3 jours | `approuve` |
| Flag ON + demande de 4 jours | `en_attente` |

Le passage du Feature Flag de OFF à ON est pris en compte par le service sans modification du code applicatif.