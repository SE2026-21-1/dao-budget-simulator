# OpenStack staging — guarded single-VM module

Terraform **1.15.8** and OpenStack provider **3.2.0** are pinned. The only new
resources are one VM, one private port, one dedicated security group and two
rules. Existing project, image, flavor, private network, IPv4 subnet, router and
keypair are looked up, never created or modified. No floating IP, shared-network
changes, application ingress, DNS/TLS, cloud-init or application deployment.

## Profiles and verified images

`profile` defaults to **standard**. Nullable `vcpus`, `ram_mb` and `root_disk_gb`
overrides use these defaults; explicit overrides cannot lower the profile floor:

| Profile | Minimum vCPU | Minimum RAM (MiB) | Root disk (GiB) |
| --- | --- | --- | --- |
| `standard` | 4 | 8192 | Default 100; minimum 100 |
| `demo` | 2 | 4096 | Default 40; selectable whole GiB from 30 through 40 |

An existing flavor must meet the CPU/RAM minimum. With `boot_from_volume=false`
(default), its local root disk must meet `root_disk_gb`, and demo flavor disks
cannot exceed 40 GiB. A selected 30-GiB demo minimum can therefore use a 40-GiB
flavor; choose a 30-GiB flavor for a 30-GiB local root. A 1-GiB flavor is always
rejected. Selecting demo does not waive capacity, image or project validation.
Only after Cinder service, backend capacity, quota and volume type are verified
may `boot_from_volume=true` be used; its boot volume uses the exact resolved
`root_disk_gb` and is deleted with the VM. `boot_volume_type=null` uses the cloud
default. Local root storage is not a durable backup.

`ubuntu_version` explicitly selects **24.04** (default) or **22.04** LTS.
Set the exact `image_name` and `image_id` separately; there is no fallback lookup.
The image must have trusted, verified Glance properties `os_distro=ubuntu`,
`os_version` equal to the selected release, and `architecture=x86_64`.
Its minimum disk/RAM must fit the selected root/flavor. Missing, mismatched or
unverified metadata is not permission to relabel an image: verify provenance and
image-specific deployment-tool acceptance first. This module does not modify
image properties or claim that the current Ubuntu 22.04 image is verified.

## Current actual blockers (2026-11-18)

The initial survey found only `admin` and `service`; neither is an application
target, and plans targeting either project name are rejected. The authorized
dedicated project `dao-staging-se2026-t16`
(`2543a96aa9c54be1abf6abbcad52e10e`) has since been created, with the existing
operator assigned `member` and its project-scoped identity verified. It has
**no networks**. The old network/subnet/router IDs belong to `admin`, not this
project; they are intentionally absent from the example. Planning remains
blocked until approved project-owned networking exists (or a separately
reviewed sharing design is explicitly authorized; this root does not implement
that design or modify shared networks).
The surveyed flavor `m1.lab` is 1 vCPU / 1024 MiB / 10 GiB and remains unusable.
The existing `ubuntu-22.04` image lacks the required metadata; provenance and
Docker/Compose execution on it have not been verified. No Cinder service was found.

Nova compute `ptdung` (`192.168.1.2`) is **DOWN**, with last reported heartbeat
`2026-11-17T17:29`; scheduler/conductor are up. The prior 7321-MiB figure is
reported Placement/Nova schedulable RAM (7833 total minus 512 reserved), **not
physical free memory**; the 16-GiB Nova least-available disk figure is also stale
while compute is down. Placement reports no usage, but this does not prove live
headroom: the host survey found only 1176 MiB available memory with 8583 MiB swap
used, and 13.1 GiB available on the inspected root filesystem. The actual Nova
instance-storage filesystem/backend path remains unknown until authorized
administrator inspection of the compute configuration and mounts. Host `df`
alone does not prove Nova backend capacity. The standard 8192-MiB request even
exceeds reported Placement memory; demo fits that scheduler inventory but not
the surveyed live headroom. Recover compute and verify fresh Placement/Nova
capacity, actual storage backend and project quota before creation. Do not
force admission through quota increases or allocation-ratio/overcommit changes.
The user authorizes private flavor creation only if
actual compute capacity suffices, and a demo at 2 vCPU / 4096 MiB / 30–40 GiB;
this is not authorization to bypass those checks. Flavor/project provisioning
is a separate administrator action, not part of this Terraform module.

## Project-scoped operator preparation

- Separate administrator provisioning credentials from Terraform credentials.
  Use a dedicated staging-project-scoped `OS_*` environment or `OS_CLOUD` /
  external `clouds.yaml` for Terraform, matching `project_id` and the reviewed
  region. Do not run this root with the administrator's project scope or merely
  change an ID while retaining that scope. The provider pins `tenant_id`, and the
  project lookup rejects names `admin` and `service` (case/whitespace normalized);
  this guard does not replace independent token-scope verification.
- Use only the target project's existing approved private network/router.
  Verify the router interface serves the subnet, DHCP/image networking, DNS and
  outbound routing. Lookup proves existence/ownership, not connectivity. Do not
  modify shared routing to make the plan pass. Use existing VPN/bastion/private
  routing; this root never allocates or associates a floating IP.
- Set a trusted IPv4 `admin_cidr`, /24 or narrower (/32 preferred). The example
  TEST-NET address is not a real access configuration. Only TCP/22 ingress and
  IPv4 egress for maintenance/GHCR pulls are allowed. Default security-group
  rules are removed; the port does not inherit the default group.
- Verify SSH host keys independently. Runtime secrets, private keys and GHCR
  credentials stay outside Terraform. Docker/Compose and release acceptance
  remain separate gates; infrastructure validation is not application readiness.

## Backend/state precautions and offline checks

No backend is configured; this standalone root uses the local backend. Before a
shared deployment, agree on an encrypted, access-controlled, locking remote
backend and reviewed state-migration procedure. Preserve existing state and
backend ownership. Do not point this root at another person's backend, import
personal resources or print state. Earlier metadata-only searches found no
state in their surveyed paths; that does not establish no state exists elsewhere.
Never commit credentials, `.terraform/`, real tfvars, state, logs or plan artifacts.

The following checks passed locally for this profile/image change. They do not
contact the cloud or create resources:

```bash
terraform -chdir=infra/openstack fmt -check -diff -recursive
terraform -chdir=infra/openstack init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/openstack validate -no-color
```

An actual project-scoped demo plan was also executed with the current inventory
and exited 1: it rejected the 1-vCPU/1-GiB/10-GiB flavor, unverified image metadata,
and old admin-owned network/router. Its partial security-group proposal is not
an applicable plan; no apply or saved plan was used.

Offline provider-mocking tests were attempted but not retained: provider 3.2.0
declares these returned lookup fields Optional rather than Computed, so Terraform
mocks leave the guard inputs null. No mock PASS is claimed and production guards
were not weakened to accommodate mocks. Real plan rejection is the observed proof.
CI format/schema checks do not attest to capacity or VM/network/runtime readiness.

After all actual blockers are resolved, copy `terraform.tfvars.example` to a
protected file outside Git, replace every placeholder and the admin CIDR, then:

```bash
# Operator-created, chmod 600; no saved plan or state import.
terraform -chdir=infra/openstack plan -input=false -no-color \
  -var-file=/secure/dao-staging.tfvars
```

Treat terminal output as sensitive. Review exactly one server and only the
resources listed above. Do not apply until target-project authorization,
fresh actual capacity, image verification and the complete plan are accepted.
