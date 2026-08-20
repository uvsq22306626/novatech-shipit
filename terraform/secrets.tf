resource "aws_secretsmanager_secret" "db_password" {
  name = "${var.app_name}/${var.environment}/db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name = "${var.app_name}/${var.environment}/jwt-secret"
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "stripe_key" {
  name = "${var.app_name}/${var.environment}/stripe-secret-key"
}

resource "aws_secretsmanager_secret" "migration_admin_key" {
  name = "${var.app_name}/${var.environment}/migration-admin-key"
}
