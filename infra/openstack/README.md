# OpenStack staging — review only

One Ubuntu **24.04 x86_64** VM; default minimum **4 vCPU / 8192 MiB**, exactly
**100 GiB** root disk. Terraform **1.15.8**, OpenStack provider **3.2.0**, pinned
exactly. Only new resources are one VM, one private port, one security group and
two rules. Existing image, flavor, project, network, IPv4 subnet, router and
keypair are looked up, never created or modified. No floating IP, public
application ports, new router interface, DNS, TLS, application deployment or
contract deployment is included.

## Current hard blockers (2026-11-18)

Authenticated project: `admin`, `9dcc4173a3ba466b8836759c8c367618`; inventory
reported no servers, including the all-project server list. Only image:
`ubuntu-22.04` (`73655619-91f2-41a9-82eb-e08047517710`). Only flavor: `m1.lab`
(`ad704641-b42d-4931-8d8d-09f4cc76fb8f`, 1 CPU / 1024 MiB / 10 GiB).
**Neither is an acceptable substitute.** No block-storage/Cinder service exists.
Hypervisor inventory reports 4 CPU, 7833 MiB total / 7321 MiB free RAM,
97 GiB local disk / 16 GiB least available disk. The workstation has only about
14 GiB free. These cannot satisfy the approved specification; stop before any
resource creation. A cloud administrator must provide an approved image,
existing suitable flavor and sufficient actual capacity/quota, not just change
an ID or lower a requirement.

Example inputs include the known existing network/subnet/router/keypair IDs,
but deliberately **no runnable image/flavor substitute**. Image lookup requires
an exact name and ID, plus trusted Glance properties `os_distro=ubuntu`,
`os_version=24.04`, `architecture=x86_64`; an administrator must verify the image
provenance and publish accurate metadata. Flavor checks fail closed on CPU/RAM
and, for the default non-Cinder path, root disk must equal 100 GiB.

The follow-up survey still found no server or suitable flavor. Seven existing
unassociated floating IPs were found, but none was allocated, attached or selected
for staging. The management host has an existing route to the private subnet
through router `192.168.248.204`, so a new floating IP is not required merely to
attempt SSH from this host.

The active identity has the project `admin` role. This is a technical capability,
not explicit authorization to create global flavors or change shared quota.
An administrator must confirm the application's target project and provision a
4-vCPU / 8192-MiB flavor and real disk capacity (or a suitable Cinder service).
Quota is not the limiting evidence; changing quota alone cannot supply RAM/disk.
Ubuntu 22.04 is now acceptable only after image-specific runbook/tool acceptance.
The existing image has no `os_distro`, `os_version` or `architecture` properties;
neither its provenance nor Docker/Compose execution on that image was verified.
The image guard therefore remains fail-closed rather than relabeling it as tested.

## Operator preparation

- Use externally managed `OS_*` credentials or `OS_CLOUD` / `clouds.yaml` outside
  Git. The provider targets `project_id`; verify authenticated project/region
  independently before planning. Never include tokens, passwords, private keys,
  real tfvars, state, backend credentials, logs or plan artifacts in a PR.
- Verify the existing router actually has an interface on the selected subnet,
  DHCP/image network support, DNS and required outbound routing. Router lookup
  proves existence/ownership only; it does not prove connectivity. Do not
  modify shared routing to make a plan pass.
- Choose a real trusted IPv4 admin source CIDR (/24 or narrower; /32 preferred),
  reachable over existing VPN/bastion/private routing. The example TEST-NET
  address is documentation, not access configuration. Only TCP/22 ingress is
  allowed. Default security-group rules are removed; explicit IPv4 egress is
  allowed for maintenance and later GHCR pulls. No IPv6 ingress/egress or
  application ingress is added; the port does not inherit the default group.
- With no Cinder, use `boot_from_volume=false` and an existing flavor with a
  100 GiB local root disk. Local root storage is not durable backup. Only after
  a block-storage service, capacity/quota and an existing volume type are
  independently verified may `boot_from_volume=true` be selected. The boot
  volume is 100 GiB; `boot_volume_type=null` uses the service default, otherwise
  supply an existing type. Boot volume deletion follows VM termination.
- No cloud-init is supplied: infrastructure review must not silently install
  software or run mutable internet scripts. The application deployment
  runbook is currently in [PR #55](https://github.com/SE2026-21-1/dao-budget-simulator/pull/55)
  rather than Dev; infrastructure has no dependency on merging its mixed history.
  After clean application integration, use Docker Engine, Compose >=2.24.4,
  Node 24.15.0 and the existing `/srv/dao` layout.
  Verify SSH host keys through an independent console. Docker access is
  root-equivalent. Runtime secrets and GHCR credentials stay outside Terraform.
  DNS/HTTPS and application release acceptance remain separate gates.

## Backend/state handling and final review commands

No backend is configured: this standalone root uses Terraform's local backend.
Before a future shared deployment, agree on an encrypted, access-controlled,
locking remote backend and a reviewed state-migration procedure. Do not point
this root at someone else's backend, import personal resources, or print state.
The metadata-only scan under the project (depth 5) found no `.terraform`,
`terraform.tfstate*` or `*backend*.tf` paths; the parent additionally scanned the
project, private-cloud-backups and Documents (depth 4) and found no state
metadata. No state contents or credentials were opened. This does not establish
that no state exists elsewhere.

Executed by TV4 on 2026-11-18 from the isolated Dev-based checkout:

```bash
terraform -chdir=infra/openstack fmt -check -diff
terraform -chdir=infra/openstack init -backend=false -input=false
terraform -chdir=infra/openstack validate -no-color
```

All three checks passed. The generated `.terraform.lock.hcl` pins provider
checksums; initialization created no cloud resources. Repeat these checks after
changes. Never commit `.terraform/`, real tfvars, state or saved plans.

The `TV4 OpenStack validation` workflow repeats formatting, locked provider
initialization and schema validation without cloud credentials. It cannot plan,
apply or attest to VM/network/runtime readiness. A passing workflow is a code
review gate, not infrastructure acceptance.

**An inventory-only negative plan was executed and rejected (exit 1).** It used
the actual Ubuntu 22.04 image and `m1.lab` flavor to exercise both postconditions:
the image was not verified Ubuntu 24.04 x86_64, and flavor values were
1 vCPU / 1024 MiB / 10 GiB rather than 4 / 8192 / 100. Terraform displayed a
partial proposal for a port, security group and two rules before reporting both
errors; this is **not an applicable plan**. No `-out` file or apply was used.
The workstation's `10.1.199.104/32` was only a negative-plan input, not approved
staging ingress or evidence of a reachable route. The exact command and broader
operational findings are in [the handoff](../../docs/evidence/tv4-staging-20261118.md).
After those blockers are resolved, copy `terraform.tfvars.example` to a protected file
outside the repository, replace the placeholders and admin CIDR, and use:

```bash
# /secure/dao-staging.tfvars is operator-created, chmod 600, outside Git.
terraform -chdir=infra/openstack plan -input=false -no-color \
  -var-file=/secure/dao-staging.tfvars
```

This plan has no `-out` file; treat its terminal output as sensitive too. Review
that exactly one server and only the resources listed above would be created.
Do not apply until the target project, capacity, plan and creation authority have
been confirmed. Infrastructure validation or a future successful plan is not
server readiness or application acceptance.
