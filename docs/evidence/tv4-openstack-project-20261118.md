# TV4 — isolated OpenStack project and actual compute findings

Follow-up on 2026-11-18, SE2026-T16 / Phan Thanh Dũng. **Project created; VM not
created.** The user's new authorization permits a private staging flavor only
when actual capacity is sufficient, and explicitly permits a 2-vCPU/4-GiB/30–40-GiB
demo. No quota/allocation ratio changes, forced-up service or oversized thin disk.

## Administrator action separated from Terraform scope

CLI from the existing Kolla environment: OpenStack10.3.0, RegionOne,
identity endpoint `http://192.168.1.250:5000`. Initial projects were only admin
`9dcc4173a3ba466b8836759c8c367618` and service; neither was selected for the VM.

Created **dao-staging-se2026-t16**, project ID
**2543a96aa9c54be1abf6abbcad52e10e**, after an exact-name list check found no
existing staging project. Assigned existing operator admin@Default only the
`member` role in this new project. A separately project-scoped token query
printed only project_id/user_id and confirmed the new scope. Member access to
its own project, visible public image/flavor/external network and existing
user-owned keypair was checked. No password/token/openrc or real tfvars was logged.

Equivalent idempotent administrator steps:

```bash
# Inspect exact-name inventory before creating; do not create a second project.
openstack project list -f json
openstack project create --domain Default \
  --description 'SE2026-T16 DAO Budget Simulator staging; TV4 Phan Thanh Dung; isolated project, not admin/service' \
  dao-staging-se2026-t16
openstack role add --user admin --user-domain Default \
  --project 2543a96aa9c54be1abf6abbcad52e10e member
```

Terraform and tenant checks use separate command scope, not the ambient admin
project (the credential values remain outside Git):

```bash
env -u OS_PROJECT_NAME -u OS_TENANT_NAME \
  OS_PROJECT_ID=2543a96aa9c54be1abf6abbcad52e10e \
  openstack --os-auth-type password token issue -f json -c project_id -c user_id
```

The new project has **no private network/subnet/router**. Old IDs belong to
admin and were not adopted, imported, shared or modified. Public external
network4b670660-11a4-4f98-bfb9-616230f0121b is visible to the scoped member;
keypair private-cloud-key is visible because it belongs to the existing user.
Approved project-owned networking must be provisioned through a reviewed
Terraform path before a successful VM plan. Quota remains unchanged: cores20,
instances10, RAM51200MiB. No new floating IP or private flavor was created.

## What the former capacity numbers actually mean

| Evidence | Actual observation |
|---|---|
| Nova compute identity | hostptdung, IP192.168.1.2, hypervisor/provider753f1ad8-4f0d-412f-b62c-c72970251772 |
| Same physical management/compute host | local hostnameptdung; dummy1 has192.168.1.2 and192.168.1.250; Nova identifies the same compute IP |
| Compute status | enabled but **DOWN**, last heartbeat2026-11-17T17:29:14; scheduler/conductorUP |
| Compute process | no matching nova-compute process observed |
| Legacy Nova detailed query | microversion2.53 fails HTTP400: compute service unavailable |
| Placement CPU | total4, reserved0, ratio4.0, usage0; ratio not changed |
| Placement RAM | total7833MiB, reserved512MiB, ratio1.0, usage0 |
| Placement disk | total97GiB, reserved0, ratio1.0, usage0 |
| Actual host RAM snapshot | available1176MiB, total7833MiB; swap8583MiB used /7800MiB free |
| Non-Nova guest | unrelated libvirt seed-ubuntu16-csrd is running with2vCPU/2GiB; not stopped or changed; absent from Placement usage |
| Known persistent filesystem | /dev/sda6 ext4,97.9GiB, available about13.0–13.1GiB; /var/lib/docker and /var/lib/libvirt/images resolve to this filesystem |
| Actual Nova instances/backend path | **Not verified**: /etc/kolla/nova-compute and Docker volume traversal are root-restricted; Docker socket denied and sudo-n requires password |
| Libvirt pool counter | cached pool available counter about21.6GiB disagrees with current filesystem13GiB; not used as usable capacity |

Thus **7321MiB =7833−512 is Placement schedulable inventory, not physical free RAM
after Kolla**. Placement usage0 excludes Kolla/host/non-Nova guest consumption.
The earlier Nova16GiB least-available disk figure is stale while compute is DOWN.
No assertion is made that the inspected root is definitely the Nova instances
backend: its container mount/config mapping could not be read. No Cinder service
exists in the current catalog; no alternate backend was established.

## Concrete operator remediation, not a guessed flavor

A Kolla/compute-host administrator with approved root/Docker access must:

1. Inspect nova_compute state/fault and restore its heartbeat. It is currently
   DOWN, so merely creating a flavor will not schedule a guest. Do not force-up
   the service in Nova or blindly retry Terraform.
2. Read only relevant Nova options (`instances_path`, `images_type`, RBD settings)
   and inspect nova_compute mounts to map the real backend to a host filesystem
   or storage pool. Then measure capacity there, not on the controller by assumption.
3. For local storage on the confirmed /dev/sda6 filesystem, a demo30GiB root plus
   an explicit5GiB host reserve requires35GiB available: **about22GiB additional
   free capacity** over the measured13GiB. Preferred40GiB root plus5GiB reserve
   requires45GiB: **about32GiB additional free capacity**. These are conditional
   local-backend budgets, not a claim about an uninspected remote pool. Confirm
   guest OS, images, PostgreSQL, logs and free space fit the chosen30–40GiB root.
4. Provide at least4096MiB for the guest plus a conservative1024MiB remaining
   host/Kolla margin:5120MiB available before creation. Measured1176MiB is short
   by **3944MiB (~3.85GiB)**. Do not count swap as physical RAM or stop another
   project/guest without its owner's approval.
5. Once those checks pass, idempotently create or reuse private
   dao-staging-2c4g-30g (or40g) and grant access **only** to project
   2543a96aa9c54be1abf6abbcad52e10e; validate exact CPU/RAM/disk before use.
   This flavor action is now authorized conditionally, but capacity is not met.

Useful read-only administrator commands (not executed through an unauthorized
privilege bypass):

```bash
docker inspect nova_compute --format '{{.State.Status}} {{.State.Error}}'
docker inspect nova_compute --format '{{range .Mounts}}{{println .Destination .Source .Type}}{{end}}'
# Read only storage settings; never dump nova.conf credentials.
awk '/^[[:space:]]*(instances_path|images_type|images_rbd_pool|reserved_host_memory_mb|reserved_host_disk_mb)[[:space:]]*=/' \
  /etc/kolla/nova-compute/nova.conf
# Then findmnt/df on the verified host mount/source path.
```

## Terraform changes and actual plan

PR57 now supports explicit standard (>=4CPU/8192MiB/>=100GiB) and demo
(>=2CPU/4096MiB/30–40GiB) profiles. Default stays standard. Ubuntu22.04/24.04
selection still requires verified x86_64 metadata. Project names admin/service
are rejected. Examples contain project-owned placeholders, never admin network IDs.

Local fmt/locked-init/validate/actionlint passed. Mock-only tests were attempted
but discarded: OpenStack provider3.2.0 declares returned lookup fields Optional,
not Computed; mock overrides leave postcondition inputs null. No fake test PASS
or relaxed production guard was introduced.

A real **project-scoped demo30GiB plan** used actual current image/flavor IDs
and old admin network IDs to demonstrate refusal, not to select a1GiB VM:

```bash
env -u OS_PROJECT_NAME -u OS_TENANT_NAME OS_PROJECT_ID=2543a96aa9c54be1abf6abbcad52e10e \
  terraform -chdir=infra/openstack plan -input=false -no-color -lock=false \
  -var='project_id=2543a96aa9c54be1abf6abbcad52e10e' -var='profile=demo' -var='root_disk_gb=30' \
  -var='ubuntu_version=22.04' -var='image_id=73655619-91f2-41a9-82eb-e08047517710' \
  -var='image_name=ubuntu-22.04' -var='flavor_id=ad704641-b42d-4931-8d8d-09f4cc76fb8f' \
  -var='network_id=e933779a-b348-4112-b3b3-f116c924833b' \
  -var='subnet_id=774abbe6-6e75-4d81-a899-4f53005e0e23' \
  -var='router_id=07b1cf0c-6e53-4a08-941d-398ffbffeeb1' \
  -var='keypair_name=private-cloud-key' -var='admin_cidr=192.168.248.1/32'
```

Exit1: image metadata rejected, flavor1CPU/1024MiB/10GiB rejected against resolved
minimum2CPU/4096MiB/root30, no matching own-project network/router. A partial
3-resource security-group/rule proposal is **not an applicable plan**. No saved
plan, Terraform apply, VM, port, SG/rule, network or volume was created by Terraform.
The only cloud writes were the dedicated Keystone project and scoped role assignment.

The existing public Ubuntu image checksum matches the local qcow2 file
(735731200bytes); qemu-img reports virtual size2361393152bytes. This proves file
identity/format, not Ubuntu version, x86 architecture, vendor trust or Docker
execution. Shared image metadata was not changed to manufacture verification.

## GitHub and deployment boundary

Existing clean app #58 HEADa44dc6c8e24ae191ce07d9b092be4db70ad4a1f2 remains green
including real isolated Compose smoke on GitHub runner, but has no TV2/TV3 peer
review. #21/#55/#31 and every personal ref remain untouched; no direct Dev push.
New independent #59, HEADc2bfb3ee638a4d3023e8505724665fe61b887adf, isolates the
verified shared Foundry installer prerequisite (four files) from the application;
actionlint passed. Exact-HEAD [BE08 44263563592](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44263563592)
and [TV4 CI 44263563611](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44263563611)
both passed; installation and actual database/reorg/rebuild/benchmark tests ran.
Peer review remains required. #57's old BE08 failure was upstream foundryup HTTP403
before tests, not a suppressed BE08 assertion or a check made green by a blind rerun.

No VM means no ACTIVE/SSH/cloud-init/guest-disk/Compose or user URL proof on a
staging VM. No local Docker workaround on the Kolla host. Existing runner smoke
is not VM smoke, Sepolia, verified GHCR release or CD end-to-end. No rollback or
80VU performance claim. Keep issue56 Blocked with this project and these exact
compute/storage access/capacity requirements; reviewable code remains in review.
