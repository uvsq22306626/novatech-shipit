output "alb_dns_name" {
  description = "DNS public de l'Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_urls" {
  description = "URLs des repositories ECR par service"
  value       = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}

output "ecs_cluster_name" {
  description = "Nom du cluster ECS"
  value       = aws_ecs_cluster.main.name
}

output "rds_endpoint" {
  description = "Endpoint de la base de données RDS"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "codedeploy_app_name" {
  description = "Nom de l'application CodeDeploy"
  value       = aws_codedeploy_app.main.name
}

output "codedeploy_deployment_group" {
  description = "Nom du deployment group CodeDeploy (Blue/Green)"
  value       = aws_codedeploy_deployment_group.main.deployment_group_name
}
