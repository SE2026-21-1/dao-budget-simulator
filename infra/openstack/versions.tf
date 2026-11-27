terraform {
  required_version = ">= 1.9, < 2.0"

  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 3.0"
    }
  }
}

# Authenticate outside Git with project-scoped OS_* variables or clouds.yaml.
provider "openstack" {
  tenant_id = var.project_id
}
