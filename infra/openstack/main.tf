data "openstack_identity_project_v3" "existing" {
  project_id = var.project_id
}

data "openstack_images_image_v2" "ubuntu" {
  name = var.image_name

  lifecycle {
    postcondition {
      condition = (
        self.id == var.image_id &&
        lookup(self.properties, "os_distro", "") == "ubuntu" &&
        lookup(self.properties, "os_version", "") == "24.04" &&
        lookup(self.properties, "architecture", "") == "x86_64" &&
        self.min_disk_gb <= 100
      )
      error_message = "Image ID must match a verified Ubuntu 24.04 x86_64 image with explicit os_distro/os_version/architecture metadata and minimum disk <=100 GiB."
    }
  }
}

data "openstack_compute_flavor_v2" "existing" {
  flavor_id = var.flavor_id

  lifecycle {
    postcondition {
      condition = (
        self.vcpus >= var.vcpus && self.ram >= var.ram_mb &&
        (var.boot_from_volume || self.disk == 100)
      )
      error_message = "Existing flavor must meet CPU/RAM requirements and, without Cinder, provide exactly 100 GiB root disk. Do not substitute m1.lab."
    }
  }
}

data "openstack_networking_network_v2" "existing" {
  network_id = var.network_id
  tenant_id  = data.openstack_identity_project_v3.existing.id
}

data "openstack_networking_subnet_v2" "existing" {
  subnet_id  = var.subnet_id
  network_id = data.openstack_networking_network_v2.existing.id
  ip_version = 4
}

data "openstack_networking_router_v2" "existing" {
  router_id = var.router_id
  tenant_id = data.openstack_identity_project_v3.existing.id
}

data "openstack_compute_keypair_v2" "existing" {
  name = var.keypair_name
}

resource "openstack_networking_secgroup_v2" "ssh" {
  name                 = "${var.name}-ssh"
  description          = "SSH from the trusted admin CIDR only; no public application ingress"
  delete_default_rules = true
}

resource "openstack_networking_secgroup_rule_v2" "ssh" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = var.admin_cidr
  security_group_id = openstack_networking_secgroup_v2.ssh.id
}

# Outbound access is needed for OS maintenance and later GHCR image pulls.
# Stateful security groups allow replies without opening application ingress.
resource "openstack_networking_secgroup_rule_v2" "egress" {
  direction         = "egress"
  ethertype         = "IPv4"
  security_group_id = openstack_networking_secgroup_v2.ssh.id
}

resource "openstack_networking_port_v2" "staging" {
  name               = var.name
  network_id         = data.openstack_networking_network_v2.existing.id
  admin_state_up     = true
  security_group_ids = [openstack_networking_secgroup_v2.ssh.id]

  fixed_ip {
    subnet_id = data.openstack_networking_subnet_v2.existing.id
  }
}

resource "openstack_compute_instance_v2" "staging" {
  name      = var.name
  image_id  = var.boot_from_volume ? null : data.openstack_images_image_v2.ubuntu.id
  flavor_id = data.openstack_compute_flavor_v2.existing.id
  key_pair  = data.openstack_compute_keypair_v2.existing.name

  network {
    port = openstack_networking_port_v2.staging.id
  }

  dynamic "block_device" {
    for_each = var.boot_from_volume ? [1] : []
    content {
      uuid                  = data.openstack_images_image_v2.ubuntu.id
      source_type           = "image"
      destination_type      = "volume"
      volume_size           = 100
      volume_type           = var.boot_volume_type
      boot_index            = 0
      delete_on_termination = true
    }
  }

  lifecycle {
    precondition {
      condition     = data.openstack_images_image_v2.ubuntu.min_ram_mb <= data.openstack_compute_flavor_v2.existing.ram
      error_message = "The chosen flavor cannot satisfy the image minimum RAM."
    }
  }

  # Reading the router does not create or modify any router/interface.
  depends_on = [data.openstack_networking_router_v2.existing]
}
