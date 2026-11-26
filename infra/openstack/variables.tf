variable "project_id" {
  description = "Existing isolated project; provision project/membership separately as cloud operator."
  type        = string
}

variable "external_network_id" {
  description = "Existing provider network, never created or deleted by this module."
  type        = string
}

variable "floating_ip_pool" {
  type    = string
  default = "public"
}

variable "image_id" {
  description = "Existing Ubuntu 22.04 cloud image."
  type        = string
}

variable "flavor_name" {
  description = "Existing project-accessible 2-vCPU/2048-MiB/20-GiB flavor."
  type        = string
  default     = "dao-demo-2c2g20"
}

variable "ssh_public_key_path" {
  description = "Existing PUBLIC key only; private keys are never generated in Terraform state."
  type        = string

  validation {
    condition     = endswith(var.ssh_public_key_path, ".pub")
    error_message = "Supply a .pub file, never a private key."
  }
}

variable "management_cidr" {
  description = "SSH source actually seen by Neutron (Kolla host br-ex in this lab)."
  type        = string
  default     = "192.168.248.1/32"

  validation {
    condition     = can(cidrnetmask(var.management_cidr)) && var.management_cidr != "0.0.0.0/0"
    error_message = "Use a restricted IPv4 management CIDR."
  }
}

variable "subnet_cidr" {
  type    = string
  default = "10.20.30.0/24"
}

variable "private_ip" {
  type    = string
  default = "10.20.30.192"
}
