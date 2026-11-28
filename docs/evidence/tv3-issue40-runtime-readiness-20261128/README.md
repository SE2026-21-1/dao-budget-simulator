# Issue40 runtime authorization packet — TV3

**ISSUE40 RUNTIME PREPARATION PARTIAL — MISSING OWNER/ALLOCATION/CONFIGURATION CONFIRMATIONS**  
Ownership/controller responsibility and preparation-only tuple/path proposals are confirmed; remaining confirmations concern operation-window use, sealed control configuration and separate execution authority.
**ISSUE40 OPEN / HOLD — RUNTIME SKIP**

## Scope and current disposition

Preparation and authorized scoped read-only inventory only. No lifecycle, service launch/stop, package installation, deployment, endpoint bind/connect/query, shared infrastructure change or regression rerun. Preparation source checkout/submodule downloads contacted GitHub only. Documentation publication is not executable-source approval.

User confirmed TV3 owns/controls Windows account Thuc and WSL account chung2k5; TV3 is designated runtime and Windows-control controller. User approved the candidate four-port tuple **for packet/preparation only**, not actual use/reservation; approved canonical path proposals and attempt label `issue40-lifecycle-01` subject to final path checks. Operation window was not supplied. No execution authorization.

## Reviewed source and preserved acceptance

- Exact source **`7526e045753707599e98d08d69f1b64380027291`**, tree **`0c2e643f4b73fb72023f9a733973343deb83a40e`**, branch `tv3/issue40-rpc-isolation-20261128`; remote head still matched in captured GitHub snapshot.
- Ancestry e8e443c → ba386dd → dbedc913 → 7526e04; no latest Dev import.
- **TV4 SOURCE APPROVED / TV2 SOURCE APPROVAL PENDING**. [TV4 same-SHA approval](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240899580); [TV2 latest handoff, not approval](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240864664).
- Accepted [Restoration B design](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7238797366) and [exact-source runbook](https://github.com/SE2026-21-1/dao-budget-simulator/blob/7526e045753707599e98d08d69f1b64380027291/docs/issue40-restoration-b.md) remain authoritative.
- [F40-1 handoff](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240592126), [F40-2 handoff](https://github.com/SE2026-21-1/dao-budget-simulator/issues/40#issuecomment-7240714621) and sealed historical packets preserved. Historical BE09/offline ZIP17/17, six GET200/CORS204/same-H/worker restart/FE live are accepted references, not rerun requirements.
- TV4 reported **126 distinct tests in nonoverlapping 108+11+7 batches**, syntax and packet integrity accepted; **not combined CI PASS** (combined wrapper timed out). No tests rerun here.

## Readiness gates

| Gate | Status | Evidence | Owner | Next action |
|---|---|---|---|---|
| Source readiness | PENDING | TV4 approved exact SHA; TV2 handoff requests review | TV2 | Explicit same-SHA independent approval |
| Receiver ownership | USER-CONFIRMED | [Ownership record](receiver-ownership.json), direct user message | TV3 | Recheck scope/window before use |
| Controller responsibility | USER-CONFIRMED | User designated TV3 for WSL runtime and Windows control; no launch/stop grant | TV3 | Separate execution grant |
| Four-port packet allocation | APPROVED | [Allocation](endpoint-allocation.json); preparation-only tuple | TV3 | Confirm operation window/use; never infer reservation |
| Candidate availability | OBSERVED ONLY | Windows/WSL OS TCP listener inventories, no matching listeners at recorded times | TV3 | Near-run inventory; authenticate after launch |
| Canonical checkout/source | VERIFIED | Two dedicated clean exact-SHA checkouts, five initialized recursive pins | TV3 | Recheck before use; evidence branch is not runtime source |
| Private runtime paths | PENDING | [Path proposals](canonical-paths.json) approved; state/PGDATA/socket not created | TV3 | Concrete path/ACL/symlink/collision proof near run |
| Windows actual toolchain | VERIFIED | Actual node.exe24.21.0/npm.cmd11.19.0, version exits0 and hashes | TV3 | Approve sealed full control config |
| Windows control configuration | PENDING | [Control draft](windows-control.json); entrypoint/dependencies absent, env policy/digest unsealed | TV3 + TV2 | Permit locked dependency preparation separately; approve exact env/deployment policy |
| Restoration B design | APPROVED | Accepted runbook, [ordered checklist](restoration-b-checklist.md) | TV3/TV4 | Actual control and lifecycle remain NOT AUTHORIZED |
| Fresh runtime preflight | PENDING | [Current inventory](preflight-inventory.txt), not final preflight | TV3 | Operation window, near-run inventory/route/ownership |
| Preregistration | PENDING | [Draft](runtime-preregistration-draft.json); actual run/deployment/manifest null | TV3 | Finalize only after preceding gates |
| Execution authorization | NOT AUTHORIZED | User explicitly limited this turn to preparation/read-only | Receiver owner | Separate explicit grant after all gates |
| Runtime acceptance | NOT CHECKED | No lifecycle/control HTTP evidence produced | TV2/TV4 | Review future authorized raw evidence only |

## Actual preparation and inspection findings

Created dedicated WSL `/home/chung2k5/dao-budget-issue40-runtime-7526e04` and Windows `D:\DAO-Issue40-7526e04` source checkouts, detached at reviewed SHA, initialized all five recursive submodules. Both observed Git-clean. Existing Windows `D:\DAO-Budget-Simulator` at 4cba99a0 has user changes; untouched. Historical WSL checkout remains e8e443c; untouched except repository-local fetch/worktree metadata needed for isolated checkouts.

Windows10 Pro19045, Ubuntu26.04.1/WSL2; WSL Node24.15.0/npm11.12.1/Foundry1.8.5. PATH PostgreSQL commands are wrappers for private18.4; system `/usr/lib/postgresql/18/bin/postgres` reports18.6. Future config explicitly selects private18.4 bin + library directory so sibling postmaster identity resolution does not use wrappers/system PG. No PostgreSQL connection occurred.

Only protected5432 appeared in scoped inventories (WSL loopback; Windows wslrelay PID17564). No ownership/use permission inferred and no request sent. Shared task remained Disabled/Enabled=false, principal Thuc. WslService/iphlpsvc Running; LxssManager Stopped; portproxy output empty. Shared settings unchanged; route inventory does not prove cross-namespace reachability. Windows/WSL loopback semantics require authorized runtime proof later.

Windows checkout lock/config bytes differ from Git LF blobs by CRLF only; [both actual and blob hashes](canonical-paths.json) retained; normalized comparison matched all four inspected files. No source rewrite. Dependency trees absent on both new checkouts; no Vite entrypoint hash or approved env digest exists. Private control/state/runtime directories remain absent; effective permissions/collisions must be rechecked before creation/use.

## Packet and validation

- [Owner/controller confirmation](receiver-ownership.json)
- [Four-port allocation](endpoint-allocation.json)
- [Canonical source/runtime paths and hashes](canonical-paths.json)
- [Actual Windows tools and intended control command](windows-control.json)
- [Preregistration draft](runtime-preregistration-draft.json)
- [Restoration B checklist](restoration-b-checklist.md)
- [Raw permitted inventory](preflight-inventory.txt)
- [Remaining authorization request](authorization-request.md)
- [Exact payload checksums](SHA256SUMS)

`SHA256SUMS` covers the nine payload files, not itself. Validate JSON/Markdown/local links, exact SHA/tree/tuple/path bindings, protected exclusions, raw UTC/command/group-exit provenance, nonsecret proposal digest, secret-sensitive patterns, exact checksum coverage and `git diff --check` after sealing. No product code/pins/CI/historical evidence modified. Validation outcome and checksum-inventory hash are reported in the publishing handoff, outside this immutable payload to avoid a self-referential seal.
