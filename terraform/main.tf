terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "novatech-terraform-state"
    key            = "hrflow/terraform.tfstate"
    region         = "eu-west-3"
    dynamodb_table = "novatech-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "novatech-hrflow"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
