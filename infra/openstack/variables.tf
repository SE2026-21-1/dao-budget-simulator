variable "name" {
  description = "Name of the single staging VM and its dedicated security group/port."
  type        = string
  default     = "dao-staging"
}

variable "project_id" {
  description = "Dedicated staging project UUID; must match project-scoped OS_* / OS_CLOUD credentials. Projects named admin or service are rejected."
  type        = string
}

variable "image_id" {
  description = "Existing verified Ubuntu LTS x86_64 image UUID; must match image_name and selected ubuntu_version metadata."
  type        = string
}

variable "ubuntu_version" {
  description = "Explicit Ubuntu LTS release; image metadata must match this selection."
  type        = string
  default     = "24.04"
  validation {
    condition     = contains(["22.04", "24.04"], var.ubuntu_version)
    error_message = "Select Ubuntu LTS 22.04 or 24.04; other releases are not approved."
  }
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

variable "profile" {
  description = "Standard: >=4 vCPU/8192 MiB/100 GiB. Demo: >=2 vCPU/4096 MiB and 30-40 GiB root. Defaults apply when scalar overrides are null."
  type        = string
  default     = "standard"
  validation {
    condition     = contains(["standard", "demo"], var.profile)
    error_message = "Profile must be standard or demo."
  }
}

variable "vcpus" {
  description = "Optional minimum whole vCPUs; null uses the profile minimum. Cannot lower that minimum."
  type        = number
  default     = null
  validation {
    condition     = var.vcpus == null ? true : var.vcpus >= (var.profile == "demo" ? 2 : 4) && floor(var.vcpus) == var.vcpus
    error_message = "Minimum vCPUs must be a whole number >=4 for standard or >=2 for demo."
  }
}

variable "ram_mb" {
  description = "Optional minimum whole MiB; null uses the profile minimum. Cannot lower that minimum."
  type        = number
  default     = null
  validation {
    condition     = var.ram_mb == null ? true : var.ram_mb >= (var.profile == "demo" ? 4096 : 8192) && floor(var.ram_mb) == var.ram_mb
    error_message = "Minimum RAM must be whole MiB >=8192 for standard or >=4096 for demo."
  }
}

variable "root_disk_gb" {
  description = "Root GiB: null defaults to standard=100/demo=40; standard >=100, demo 30-40. Local flavor disk must meet this minimum (demo capped at 40); a Cinder boot volume uses this exact size."
  type        = number
  default     = null
  validation {
    condition = var.root_disk_gb == null ? true : (
      floor(var.root_disk_gb) == var.root_disk_gb &&
      (var.profile == "demo" ? var.root_disk_gb >= 30 && var.root_disk_gb <= 40 : var.root_disk_gb >= 100)
    )
    error_message = "Root disk must be whole GiB: standard >=100 or demo between 30 and 40."
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
  description = "Opt in only after Cinder service/capacity/quota is verified. Default uses the selected profile's local flavor root disk."
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
