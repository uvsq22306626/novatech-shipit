# Runbook d'incident — NovaTech HRFlow

**Dernière mise à jour** : 20/08/2026
**Audience** : astreinte technique, on-call
**Objectif** : donner une procédure exécutable (détection → diagnostic → résolution → rollback) pour les incidents de production sur HRFlow, sans dépendre de la mémoire d'une seule personne.

> Contexte : ce runbook existe suite à l'incident du 14/15 août 2024 (voir [`incident-aout-2024.md`](./incident-aout-2024.md)), où l'absence de monitoring, d'alerting et de procédure de rollback a transformé une migration SQL ratée en coupure de 3h07 avec perte de données.

---

## 1. Niveaux de sévérité

| Niveau | Définition | Exemples | Délai de réponse (accusé de réception) | Délai de mitigation cible | Canal Slack | Escalade |
|---|---|---|---|---|---|---|
| **P1 — Critique** | Service indisponible ou perte/corruption de données en production. Impact direct sur tous les clients ou sur la paie (activité cœur de métier). | Service `paie` DOWN, corruption table `employees`, API Gateway injoignable, perte de données | **Immédiat** (< 5 min, astreinte réveillée) | **< 30 min** | `#astreinte-p1` (`severity: p1`, `group_wait: 0s`, ré-alerte toutes les 15 min) | Astreinte → Lead Dev → CTO/CEO si non résolu sous 30 min |
| **P2 — Critique / dégradé majeur** | Fonctionnalité majeure dégradée mais service globalement joignable. Taux d'erreur élevé, latence forte, un service secondaire down. | Taux 5xx > 5 % sur `api-gateway`, `HighLatencyP99` > 1s soutenu, un service non-paie DOWN | **< 15 min** (heures ouvrées) / **< 30 min** (hors heures ouvrées) | **< 2 h** | `#alertes-critiques` (`severity: critical`, `group_wait: 10s`, ré-alerte toutes les 1h) | Ingénieur de garde → Lead Dev si non résolu sous 2h |
| **P3 — Mineur / avertissement** | Dégradation ponctuelle sans impact utilisateur visible, ou signal précoce (ressources, tendance). | CPU > 80 % pendant 5 min, mémoire > 500 Mo, pic de latence isolé | **< 4 h** (heures ouvrées) | **< 1 jour ouvré** | `#alertes-warning` (`severity: warning`, ré-alerte toutes les 4h) | Traité au prochain créneau de dev, pas d'astreinte |

**Règle d'inhibition** : une alerte `p1` active supprime automatiquement les alertes `warning`/`critical` du même `job` (voir `inhibit_rules` dans `monitoring/alertmanager.yml`) pour éviter le bruit pendant un incident déjà pris en charge.

**Règle d'or** : en cas de doute sur le niveau, on classe toujours **au niveau supérieur**. Il est moins coûteux de désescalader un P2 en P3 que l'inverse.

---

## 2. Scénarios d'incident

### Scénario 1 — Service paie DOWN (type incident P1 août 2024)

**Contexte réel** : le 14/08/2024, une migration `/paie/migrate` lancée manuellement en production sans authentification a corrompu la table `employees`. Aucune alerte n'existait : la panne n'a été détectée que 2h28 plus tard par un appel client. La route a d'abord été protégée par `MIGRATION_ADMIN_KEY`, puis **retirée définitivement du service** (les colonnes qu'elle ajoutait sont désormais créées directement par le schéma initial, voir `db/init.sql`) ; le service est monitoré depuis.

#### Détection
- Alerte Prometheus/Alertmanager : **`PaieServiceDown`** (`up{job="paie"} == 0`, `for: 30s`, `severity: p1`)
- Notification Slack immédiate dans `#astreinte-p1` : *"[P1] Service PAIE indisponible"*
- Dashboard Grafana "Golden Signals" (`monitoring/grafana/`) : panneau *Saturation/Traffic* du service `paie` à zéro, panneau *Errors* qui chute avec lui (plus de requêtes du tout)

#### Diagnostic
```bash
# 1. Confirmer l'état du service côté Prometheus
curl -s http://localhost:9090/api/v1/query --data-urlencode 'query=up{job="paie"}'

# 2. Vérifier les tâches ECS (prod / staging)
aws ecs describe-services \
  --cluster novatech-hrflow-prod \
  --services novatech-hrflow-prod-paie \
  --query 'services[0].{status:status,running:runningCount,desired:desiredCount,events:events[0:5]}'

# 3. Récupérer les derniers logs du conteneur pour identifier la cause (crash, DB, OOM...)
aws logs tail /ecs/novatech-hrflow/prod/paie --since 20m --follow

# 4. Vérifier l'état de la base de données (corruption, connexions saturées, table verrouillée)
aws rds describe-db-instances \
  --db-instance-identifier novatech-hrflow-prod \
  --query 'DBInstances[0].DBInstanceStatus'

# En cas de suspicion de corruption de table (comme en août 2024), se connecter en lecture seule
# via un bastion/tunnel autorisé et vérifier l'intégrité, SANS écrire :
#   SELECT count(*) FROM employees;
#   SELECT * FROM employees LIMIT 5;
```

#### Résolution
1. Si la cause est un **déploiement récent** (task definition défaillante) → **rollback ECS immédiat** (section 4).
2. Si la cause est une **migration/corruption de données** :
   - La route `/paie/migrate` qui a causé l'incident d'origine a été retirée du service — aucune migration de schéma ne doit être rejouée via une route HTTP applicative pour "réparer" une corruption.
   - Couper l'accès en écriture au service `paie` (`desired_count=0` ou mise en maintenance via l'API Gateway) pour éviter d'aggraver la corruption.
   - Restaurer la table depuis le dernier backup RDS automatisé (voir `terraform/rds.tf` pour la fenêtre de rétention configurée) :
     ```bash
     aws rds restore-db-instance-to-point-in-time \
       --source-db-instance-identifier novatech-hrflow-prod \
       --target-db-instance-identifier novatech-hrflow-prod-restore-$(date +%Y%m%d%H%M) \
       --restore-time "<timestamp juste avant la corruption>"
     ```
   - Comparer les données restaurées avec la base courante avant bascule finale, pour chiffrer la perte de données réelle.
3. Une fois la cause corrigée, remettre `desired_count` à sa valeur nominale et surveiller `PaieServiceDown` repasser à `resolved` dans Alertmanager (`send_resolved: true`).

#### Rollback ECS Blue/Green (si nécessaire)
Le service `paie` n'est **pas** rattaché au listener CodeDeploy Blue/Green (seul `api-gateway` l'est, voir `terraform/codedeploy.tf`) : son rollback se fait par **retour à la task definition précédente** (procédure ECS standard, section 4.1).

---

### Scénario 2 — Taux d'erreurs 5xx > 5 % sur `api-gateway`

#### Détection
- Alerte Prometheus/Alertmanager : **`High5xxErrorRate`**
  `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05`, `for: 1m`, `severity: critical`
- Notification Slack dans `#alertes-critiques` : *"Taux d'erreurs 5xx critique sur api-gateway"*
- Dashboard Grafana Golden Signals : panneau *Errors* (taux 5xx) au-dessus du seuil, corrélé avec le panneau *Latency* si la cause est un timeout aval

#### Diagnostic
```bash
# 1. Identifier quelle route/quel service en aval génère les 5xx
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=sum by (route, status) (rate(http_requests_total{job="api-gateway",status=~"5.."}[5m]))'

# 2. Vérifier la santé de chaque service en amont (auth, paie, congés, recrutement)
for svc in auth paie conges recrutement; do
  aws ecs describe-services --cluster novatech-hrflow-prod --services novatech-hrflow-prod-$svc \
    --query "services[0].{svc:'$svc',running:runningCount,desired:desiredCount}"
done

# 3. Logs de l'api-gateway sur la fenêtre de l'incident
aws logs tail /ecs/novatech-hrflow/prod/api-gateway --since 15m --follow

# 4. Vérifier l'état de la target group ALB (unhealthy hosts = cause fréquente de 5xx)
aws elbv2 describe-target-health \
  --target-group-arn "$(aws elbv2 describe-target-groups --names novatech-hrflow-prod-blue --query 'TargetGroups[0].TargetGroupArn' --output text)"
```

#### Résolution
- **Si le dernier déploiement `api-gateway` coïncide avec le début des erreurs** → rollback Blue/Green immédiat (section 4.2). C'est le cas le plus fréquent d'un pic de 5xx.
- **Si un seul service en aval est en cause** (ex. `paie` renvoie 500) → traiter ce service isolément (cf. logs applicatifs, `err.message` renvoyé par les handlers Express — voir `services/paie/src/index.js`), sans rollback de l'`api-gateway` lui-même.
- **Si c'est une saturation de la base** (connexions RDS épuisées) → vérifier `HighCPUSaturation`/connexions actives RDS, et augmenter temporairement `max_connections` ou le nombre de tâches ECS si le trafic est légitime.

#### Rollback ECS Blue/Green (si nécessaire)
`api-gateway` est le seul service piloté par CodeDeploy Blue/Green (`aws_codedeploy_deployment_group.main`, cible `novatech-hrflow-{env}-api-gateway`). Suivre la procédure complète en section 4.2 — c'est le scénario type pour lequel ce mécanisme a été mis en place.

---

### Scénario 3 — Latence P99 > 1s sur le service paie en période de clôture mensuelle

**Contexte** : en fin de mois, le volume de `/paie/calculer` explose (calcul de tous les bulletins). C'est la période la plus sensible pour la performance du service paie.

#### Détection
- Alerte Prometheus/Alertmanager : **`HighLatencyP99`**
  `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 1`, `for: 2m`, `severity: warning` — **à traiter en priorité P1 opérationnelle si elle survient pendant la fenêtre de clôture**, même si son label technique est `warning` (voir note ci-dessous)
- Dashboard Grafana Golden Signals : panneau *Latency* (P50/P95/P99) sur `job="paie"`

> **Note d'exploitation** : la règle `HighLatencyP99` est générique (`severity: warning`) et ne connaît pas le calendrier métier. Pendant la clôture mensuelle (derniers 3 jours ouvrés du mois), toute alerte `HighLatencyP99` sur `job="paie"` doit être traitée par l'astreinte **comme un P2** (délai de réponse < 15 min), pas laissée dans `#alertes-warning`.

#### Diagnostic
```bash
# 1. Confirmer la latence P99 actuelle sur paie
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="paie"}[5m])) by (le, route))'

# 2. Isoler la route en cause (généralement /paie/calculer en clôture)
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=sum by (route) (rate(http_requests_total{job="paie"}[5m]))'

# 3. Vérifier la saturation CPU/mémoire du service (HighCPUSaturation / HighMemoryUsage)
curl -s http://localhost:9090/api/v1/query --data-urlencode 'query=rate(process_cpu_seconds_total{job="paie"}[5m])*100'

# 4. Vérifier les requêtes lentes côté RDS (verrouillage table employees/bulletins_paie)
aws rds describe-db-log-files --db-instance-identifier novatech-hrflow-prod
# puis consulter les slow query logs via CloudWatch Logs Insights

# 5. Vérifier le nombre de tâches ECS actives (sous-dimensionnement en pic de charge)
aws ecs describe-services --cluster novatech-hrflow-prod --services novatech-hrflow-prod-paie \
  --query 'services[0].{running:runningCount,desired:desiredCount}'
```

#### Résolution
1. **Scale-out immédiat** si la cause est un sous-dimensionnement (cas le plus fréquent en clôture) :
   ```bash
   aws ecs update-service \
     --cluster novatech-hrflow-prod \
     --service novatech-hrflow-prod-paie \
     --desired-count 3
   ```
2. Si la latence vient d'un appel externe bloquant (ex. l'appel Stripe dans `POST /paie/calculer`, actuellement fait de façon synchrone avant la réponse) → vérifier que l'erreur Stripe n'ajoute pas de délai de timeout ; en attendant un correctif applicatif (passage en asynchrone/file d'attente), documenter l'impact et prioriser en dette technique post-incident.
3. Si la base est en cause (verrous longs sur `employees`/`bulletins_paie` pendant les calculs en masse) → identifier et tuer les requêtes bloquantes anormalement longues, puis planifier les traitements de clôture par lots plus petits.

#### Rollback ECS Blue/Green (si nécessaire)
La latence en clôture est un problème de **charge**, pas de **déploiement défaillant** dans la majorité des cas : privilégier le scale-out (ci-dessus) au rollback. Si toutefois la dégradation a démarré juste après un déploiement de `paie`, appliquer la procédure de rollback standard ECS (section 4.1) — `paie` n'étant pas Blue/Green, il n'y a pas de bascule de trafic à gérer, seulement un retour à la task definition précédente.

---

## 3. Procédure de rollback ECS (< 10 minutes)

Il existe **deux mécanismes distincts** dans cette infrastructure (voir `terraform/ecs.tf` et `terraform/codedeploy.tf`) :

- **`api-gateway`** : déployé en **Blue/Green** via CodeDeploy (`deployment_controller.type = "CODE_DEPLOY"`), avec listener de prod et listener de test sur l'ALB.
- **`auth`, `paie`, `conges`, `recrutement`** : déploiement ECS standard (rolling), pas de Blue/Green — le rollback se fait par retour à la task definition précédente.

### 3.1 Rollback standard ECS (`auth`, `paie`, `conges`, `recrutement`) — ~3 min

```bash
SERVICE=paie          # remplacer par le service concerné
CLUSTER=novatech-hrflow-prod
FULL_SERVICE="novatech-hrflow-prod-${SERVICE}"

# 1. Identifier la task definition actuelle et la précédente
aws ecs describe-services --cluster $CLUSTER --services $FULL_SERVICE \
  --query 'services[0].taskDefinition' --output text

aws ecs list-task-definitions --family-prefix novatech-hrflow-prod-${SERVICE} \
  --sort DESC --query 'taskDefinitionArns[0:3]'

# 2. Revenir explicitement à la révision N-1 (ex: si la révision courante est :7, cibler :6)
PREVIOUS_TASK_DEF="novatech-hrflow-prod-${SERVICE}:6"

aws ecs update-service \
  --cluster $CLUSTER \
  --service $FULL_SERVICE \
  --task-definition $PREVIOUS_TASK_DEF \
  --force-new-deployment

# 3. Suivre le déploiement jusqu'à stabilisation (bloquant, ~1-3 min)
aws ecs wait services-stable --cluster $CLUSTER --services $FULL_SERVICE

# 4. Confirmer côté Prometheus que le service est de nouveau up
curl -s http://localhost:9090/api/v1/query --data-urlencode "query=up{job=\"$SERVICE\"}"
```

### 3.2 Rollback Blue/Green (`api-gateway` uniquement) — ~5-8 min

```bash
APP=novatech-hrflow-prod
DG=novatech-hrflow-prod-dg

# 1. Lister les déploiements récents pour identifier le dernier déploiement réussi avant l'incident
aws deploy list-deployments \
  --application-name $APP \
  --deployment-group-name $DG \
  --include-only-statuses Succeeded \
  --query 'deployments[0:5]'

# 2a. Si le déploiement fautif est ENCORE EN COURS (fenêtre de bascule de trafic) :
#     stopper et forcer le rollback automatique vers la révision précédente
aws deploy stop-deployment \
  --deployment-id <deployment-id-en-cours> \
  --auto-rollback-enabled

# 2b. Si le déploiement fautif est déjà TERMINÉ (trafic déjà basculé sur la nouvelle target group) :
#     redéployer explicitement la révision précédente connue comme saine
aws deploy create-deployment \
  --application-name $APP \
  --deployment-group-name $DG \
  --revision '{"revisionType":"AppSpecContent","appSpecContent":{"content":"<contenu-appspec-de-la-révision-précédente>"}}' \
  --description "Rollback manuel — incident $(date +%Y-%m-%d)"

# 3. Suivre l'avancement du rollback
aws deploy get-deployment --deployment-id <deployment-id-rollback> \
  --query 'deploymentInfo.{status:status,progress:deploymentOverview}'

# 4. Vérification finale : health checks ALB + Prometheus
aws elbv2 describe-target-health \
  --target-group-arn "$(aws elbv2 describe-target-groups --names novatech-hrflow-prod-blue --query 'TargetGroups[0].TargetGroupArn' --output text)"
curl -s http://localhost:9090/api/v1/query --data-urlencode 'query=up{job="api-gateway"}'
```

**Note** : la configuration Terraform active déjà `auto_rollback_configuration { enabled = true, events = ["DEPLOYMENT_FAILURE"] }` — un déploiement qui échoue techniquement (health checks KO) se rollback **automatiquement**. La procédure manuelle ci-dessus sert pour les cas où le déploiement "réussit" techniquement mais dégrade le service (bug fonctionnel, régression silencieuse).

**Budget de temps (< 10 min au total)** : détection (déjà faite via l'alerte) → identification de la révision saine (~1-2 min) → exécution de la commande de rollback (~30s) → stabilisation ECS/CodeDeploy (~3-8 min selon le mécanisme) → vérification (~1 min).

---

## 4. Template de post-mortem

À copier dans un nouveau fichier `docs/postmortem-<AAAA-MM-JJ>-<slug>.md` après tout incident P1 ou P2, **dans les 48h** suivant la résolution, pendant que le contexte est encore frais.

```markdown
# Post-mortem — <titre court de l'incident>

**Sévérité** : P1 / P2
**Rédigé par** : <nom>
**Date de rédaction** : <date>
**Durée de l'incident** : <durée> (<heure début> → <heure fin>)
**Services impactés** : <ex: paie, api-gateway>

## Résumé
<2-3 phrases : quoi, depuis quand, cause déclenchante>

## Timeline
| Heure | Événement |
|---|---|
| hh:mm | Déclenchement de la cause racine |
| hh:mm | Première alerte automatique (nom de l'alerte) |
| hh:mm | Prise en charge par l'astreinte |
| hh:mm | Diagnostic établi |
| hh:mm | Action de mitigation lancée (rollback, scale, restore...) |
| hh:mm | Service confirmé rétabli (alerte `resolved`) |
| hh:mm | Clôture de l'incident |

## Impact
- Utilisateurs/clients impactés : <nombre, segments>
- Données perdues/corrompues : <oui/non, détail>
- Impact business/contractuel : <SLA, clients à risque, etc.>

## Root cause
<cause racine technique précise — pas seulement le symptôme>

## Ce qui a bien fonctionné
- <ex : alerte déclenchée en < 1 min, rollback exécuté en < 10 min>

## Ce qui a manqué / mal fonctionné
- <ex : absence de garde-fou métier sur telle route, seuil d'alerte mal calibré>

## Actions correctives
| Action | Responsable | Échéance | Statut |
|---|---|---|---|
| <action 1> | <nom> | <date> | À faire / En cours / Fait |
| <action 2> | <nom> | <date> | À faire / En cours / Fait |

## Suivi
Ce post-mortem est revu en réunion d'équipe sous 1 semaine. Les actions correctives sont trackées jusqu'à clôture — un post-mortem sans actions closes reste un post-mortem ouvert.
```

---

## 5. Références

- Alertes : `monitoring/alerts.yml`
- Routage Alertmanager : `monitoring/alertmanager.yml`
- Dashboard Grafana : `monitoring/grafana/`
- Infrastructure ECS/ALB/CodeDeploy : `terraform/ecs.tf`, `terraform/alb.tf`, `terraform/codedeploy.tf`
- Spec API du service paie : [`openapi-paie.yml`](./openapi-paie.yml)
- Incident de référence (pourquoi ce runbook existe) : [`incident-aout-2024.md`](./incident-aout-2024.md)
