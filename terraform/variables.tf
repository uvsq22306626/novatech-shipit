variable "aws_region" {
  description = "Région AWS cible"
  type        = string
  default     = "eu-west-3"
}

variable "environment" {
  description = "Environnement de déploiement (staging | prod)"
  type        = string
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "L'environnement doit être 'staging' ou 'prod'."
  }
}

variable "app_name" {
  description = "Nom de l'application"
  type        = string
  default     = "novatech-hrflow"
}

variable "vpc_cidr" {
  description = "CIDR du VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_instance_class" {
  description = "Type d'instance RDS"
  type        = string
  default     = "db.t3.micro"
}

variable "db_name" {
  description = "Nom de la base de données"
  type        = string
  default     = "hrflow"
}

variable "db_username" {
  description = "Utilisateur de la base de données"
  type        = string
  default     = "hrflow_admin"
}

variable "ecs_task_cpu" {
  description = "CPU alloué par tâche ECS (unités)"
  type        = number
  default     = 256
}

variable "ecs_task_memory" {
  description = "Mémoire allouée par tâche ECS (Mo)"
  type        = number
  default     = 512
}

variable "services" {
  description = "Liste des microservices à déployer"
  type        = list(string)
  default     = ["api-gateway", "auth", "paie", "conges", "recrutement"]
}

variable "service_ports" {
  description = "Port exposé par chaque service"
  type        = map(number)
  default = {
    api-gateway  = 3000
    auth         = 3001
    paie         = 3002
    conges       = 3003
    recrutement  = 3004
  }
}
