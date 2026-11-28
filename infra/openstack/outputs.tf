output "server_id" {
  value = openstack_compute_instance_v2.demo.id
}

output "private_ip" {
  value = var.private_ip
}

output "floating_ip" {
  description = "May be RFC1918 in a lab; not necessarily Internet reachable."
  value       = openstack_networking_floatingip_v2.demo.address
}
