data "openstack_compute_flavor_v2" "demo" {
  name = var.flavor_name
}

resource "openstack_compute_keypair_v2" "demo" {
  name       = "dao-demo-key"
  public_key = trimspace(file(pathexpand(var.ssh_public_key_path)))
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_networking_network_v2" "demo" {
  name           = "dao-demo-net"
  admin_state_up = true
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_networking_subnet_v2" "demo" {
  name            = "dao-demo-subnet"
  network_id      = openstack_networking_network_v2.demo.id
  cidr            = var.subnet_cidr
  gateway_ip      = cidrhost(var.subnet_cidr, 1)
  ip_version      = 4
  enable_dhcp     = true
  dns_nameservers = ["1.1.1.1"]
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_networking_router_v2" "demo" {
  name                = "dao-demo-router"
  admin_state_up      = true
  external_network_id = var.external_network_id
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_networking_router_interface_v2" "demo" {
  router_id = openstack_networking_router_v2.demo.id
  subnet_id = openstack_networking_subnet_v2.demo.id
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_networking_secgroup_v2" "demo" {
  name                 = "dao-demo-sg"
  description          = "DAO demo: SSH and ICMP from management CIDR only"
  delete_default_rules = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_networking_secgroup_rule_v2" "ssh" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = var.management_cidr
  security_group_id = openstack_networking_secgroup_v2.demo.id
}

resource "openstack_networking_secgroup_rule_v2" "icmp" {
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "icmp"
  remote_ip_prefix  = var.management_cidr
  security_group_id = openstack_networking_secgroup_v2.demo.id
}

resource "openstack_networking_port_v2" "demo" {
  name               = "dao-demo-port"
  network_id         = openstack_networking_network_v2.demo.id
  admin_state_up     = true
  security_group_ids = [openstack_networking_secgroup_v2.demo.id]
  fixed_ip {
    subnet_id  = openstack_networking_subnet_v2.demo.id
    ip_address = var.private_ip
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_compute_instance_v2" "demo" {
  name       = "dao-demo-01"
  image_id   = var.image_id
  flavor_id  = data.openstack_compute_flavor_v2.demo.id
  key_pair   = openstack_compute_keypair_v2.demo.name
  user_data  = file("${path.module}/cloud-init.yaml")
  depends_on = [openstack_networking_router_interface_v2.demo]
  network {
    port = openstack_networking_port_v2.demo.id
  }
  lifecycle {
    prevent_destroy = true
    # Importing the manually configured VM must not replace it to add cloud-init.
    ignore_changes = [user_data]
  }
}

resource "openstack_networking_floatingip_v2" "demo" {
  pool = var.floating_ip_pool
  lifecycle {
    prevent_destroy = true
  }
}

resource "openstack_networking_floatingip_associate_v2" "demo" {
  floating_ip = openstack_networking_floatingip_v2.demo.address
  port_id     = openstack_networking_port_v2.demo.id
  depends_on  = [openstack_networking_router_interface_v2.demo]
}
