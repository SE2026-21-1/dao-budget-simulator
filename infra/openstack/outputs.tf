output "instance_id" {
  description = "Single staging Nova server UUID."
  value       = openstack_compute_instance_v2.staging.id
}

output "private_ipv4" {
  description = "Private address only; requires existing VPN/bastion/routed access."
  value       = openstack_networking_port_v2.staging.all_fixed_ips[0]
}

output "security_group_id" {
  value = openstack_networking_secgroup_v2.ssh.id
}

output "router_id" {
  description = "Existing router inspected, never managed by this module."
  value       = data.openstack_networking_router_v2.existing.id
}
