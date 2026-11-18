variable "name" {
  description = "Name of the single staging VM and its dedicated security group/port."
  type        = string
  default     = "dao-staging"
}

variable "project_id" {
  description = "Existing project UUID; must match the authenticated OS_* / OS_CLOUD scope."
  type        = string
}

variable "image_id" {
  description = "Existing verified Ubuntu 24.04 x86_64 image UUID. No Ubuntu 22.04 fallback."
  type        = string
}

variable "image_name" {
  description = "Exact existing image name, used for lookup; its ID and metadata are checked."
  type        = string
  default     = "ubuntu24.04"
}

variable "flavor_id" {
  description = "Existing flavor UUID with at least the requested CPU/RAM; never creates a flavor."
  type        = string
}

variable "vcpus" {
  description = "Minimum vCPU count, never below the staging baseline."
  type        = number
  default     = 4
  validation {
    condition     = var.vcpus >= 4 && floor(var.vcpus) == var.vcpus
    error_message = "Staging requires at least 4 whole vCPUs."
  }
}

variable "ram_mb" {
  description = "Minimum RAM in MiB, never below 8 GiB."
  type        = number
  default     = 8192
  validation {
    condition     = var.ram_mb >= 8192 && floor(var.ram_mb) == var.ram_mb
    error_message = "Staging requires at least 8192 MiB RAM."
  }
}

variable "network_id" {
  description = "Existing private network UUID."
  type        = string
}

variable "subnet_id" {
  description = "Existing IPv4 subnet UUID on network_id."
  type        = string
}

variable "router_id" {
  description = "Existing router UUID; operator must verify its interface serves subnet_id."
  type        = string
}

variable "keypair_name" {
  description = "Existing Nova keypair name. Private key stays outside Terraform."
  type        = string
}

variable "admin_cidr" {
  description = "Trusted IPv4 SSH source CIDR (VPN/bastion/admin subnet); /24 or narrower."
  type        = string
  validation {
    condition     = can(cidrnetmask(var.admin_cidr)) && try(tonumber(split("/", var.admin_cidr)[1]) >= 24, false)
    error_message = "Use an explicit trusted IPv4 CIDR /24 or narrower, never 0.0.0.0/0."
  }
}

variable "boot_from_volume" {
  description = "Opt in only after Cinder service/quota is verified. Default uses a 100 GiB flavor root disk."
  type        = bool
  default     = false
}

variable "boot_volume_type" {
  description = "Optional existing Cinder volume type; null selects the cloud default. Requires boot_from_volume."
  type        = string
  default     = null
  nullable    = true
  validation {
    condition     = var.boot_volume_type == null || var.boot_from_volume
    error_message = "A boot volume type requires boot_from_volume=true and a verified block-storage service."
  }
}
