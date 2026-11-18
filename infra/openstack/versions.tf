terraform {
  required_version = "= 1.15.8"

  required_providers {
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "= 3.2.0"
    }
  }
}

# Credentials come only from OS_* or OS_CLOUD outside Git; pin the target project.
provider "openstack" {
  tenant_id = var.project_id
}
