# TV4 — clean staging integration follow-up, 2026-11-18

**No VM or staging URL yet.** This is clean common application/delivery code and
bounded local verification, not Terraform apply, Sepolia, GHCR or target-VM acceptance.
Previous infrastructure/branch handoff remains at commit `da2252580b1fb351072bf68b6554e53e89d6177d`.

## Clean source and personal exclusion

Branch `feature/tv4-staging-clean` starts directly from Dev
`43acfbdec3470f9a94c70d5a2700722cba6d3852`. No merge/cherry-pick/rebase/squash
of original #21/#55 history. Those originals still contain personal PR31 ancestry
and remain unchanged. No `indexer/import`, VT064 benchmark/test/PDF, `docs/vt-064`
or archived personal evidence is included in this PR's selected diff.

| Recreated common scope | Verified source |
|---|---|
| Wallet/API/receipt/session integration, live UI and matching tests | operation `d1ddc0b67ecff7faebcf1d0b83fb823bcbc37886`; common changes `9ad0aea`, `661e22b`, `cd4d8fd`, `c31f797`, repeated-event `aadd59c`, stale-completion GOV fix `d1ddc0b` |
| Ten indexer runtime files and matching regression changes | shared recovery/publication/session consistency and bounded reconciliation `fe0bfcc` |
| Local deployment/bootstrap/operation helpers, owned-process interruption | common origins `fa498d6`, `0c99757`, `228077a`; recursive dependency guard `7fb2958` |
| SC06 frontend contract vectors | `cd4d8fd`, original fixture provenance `83301112c10bcc60635e7ec7180f8049f75d4ba9`; no chain archive rewrite |
| Runtime frontend config, deploy/, scripts/cd/, pinned Foundry helper | independent delivery source `9111d1074ed6c75388603417914f4ab61a7d3ae9` |
| CI and runbook | existing Dev suites retained; add reusable BE08/container/publish and shared bootstrap/interruption gates; rewrite clean-PR route rather than promoting mixed history |

Inspected personal commits `b61cec8`, `69ca712`, merge `b67611e`. Explicitly excluded
`6828352`, which copied personal QA source `0e9828e`, rather than importing its
Solidity/live-acceptance changes as common work. No Solidity tests, QA05/TC10 campaigns,
Sepolia deployment workflow, benchmark diagnostics, bulk historical docs/evidence or
SC06 archive rewrites were copied. Existing Dev content stays untouched where not needed.
Root package scripts did not need extra aliases.

Application commit `213013918a`; delivery commit
`dbf146e87212e071d2dc041ce36be3f78365a4c8`; explicit shared regression CI gates
`e2ba8eeb7218ff33b268c759f6ae22ce8a24540b`. File scope reviewed through selective
commit diff before push. Original dirty VT064 checkout and all personal refs unchanged.

## Local verification actually run

Node24.15.0; Foundry1.8.5; Solc0.8.37; fresh root/frontend npm installs;
recursive pinned submodules; native PostgreSQL18.4 in an owned temporary cluster.
Checks ran on recreated source before committing, with the later CI-step addition
validated by actionlint. No result is borrowed from original PR21/55.

| Check | Result |
|---|---|
| Root typecheck/build | PASS |
| BE02 / BE03 / BE04 / BE07 non-DB suites | 100 / 25 / 32 / 15 PASS, zero skipped |
| Release + operation tests | 8 PASS |
| Bootstrap + dependency provenance | 16 PASS, real disposable Anvil |
| Interrupted smoke lifecycle | 8 PASS, owned Anvil/files cleanup |
| API HTTP / projection / recovery on disposable PostgreSQL18.4 | 7 / 10 / 19 PASS, zero skipped; cluster stopped/removed |
| Frontend tests | 105 PASS, 1 opt-in live test skipped; not live API acceptance |
| Frontend lint/build | exit0; 8 existing React warnings, bundle752.48kB warning retained |
| forge build | PASS with existing dependency/lint warnings; no Solidity test-suite claim |
| actionlint / bash -n / both Compose syntax checks | PASS |
| Actual browser | production preview on loopback4187, dashboard → proposals navigation; fixture banner, read-only scope, 45 proposals shown; no browser errors or404 observed |

Commands:

```bash
export PATH=/home/ptdung/.nvm/versions/node/v24.15.0/bin:$PATH
npm ci
npm ci --prefix frontend
npm run typecheck && npm run build
npm run test:be02
npm run test:be03
npm run test:be04
npm run test:be07
node --test scripts/cd/release.test.mjs deploy/operations.test.mjs
forge build
node --test tests/smoke/bootstrap.test.mjs tests/smoke/dependency-provenance.test.mjs
node --import tsx --test tests/smoke/interruption.test.mjs
npm run test --prefix frontend
npm run lint --prefix frontend
npm run build --prefix frontend
bash -n deploy/deploy.sh scripts/cd/container-smoke.sh
actionlint
docker compose -f deploy/compose.yml config --no-interpolate --quiet
docker compose -f deploy/compose.smoke.yml config --no-interpolate --quiet
```

The native proof created a loopback-only fresh cluster and three empty owned databases,
then ran `tests/api/server.test.mjs`, `tests/indexer/projection-storage.test.ts` and
`tests/indexer/be07-db.test.mjs` with their explicit isolation guards; no serving DB,
caller DATABASE_URL or RPC_URL was used. Throwaway runner and cluster were removed.

Two preparation defects were fixed, not hidden: recreated frontend package/lock were
inconsistent (`npm ci` failed), so npm regenerated the lock; missing shared SC06 consumer
vectors caused two test imports to fail, so the proven common vector file was restored.
The first throwaway DB runner assumed a bundled `createdb` binary; the package omits it,
so the runner used `pg` to create its own databases before successful suite execution.

Browser URL `http://127.0.0.1:4187/` was **local fixture preview only**, never advertised
as staging. No fake API/manifest, readiness weakening or sample-to-live fallback.
Local Docker smoke remains blocked by socket access; actual container proof belongs
to CI of this clean PR and must be recorded separately when it completes.

## Infrastructure, permissions and handoff

Refreshed cloud is still project `admin` ID `9dcc4173a3ba466b8836759c8c367618`, no
servers, only Ubuntu22.04/m1.lab1vCPU/1024MiB/10GiB, no Cinder. Physical hypervisor
RAM7833MiB total/free7321MiB and least disk16GiB; host has14GiB free, no other mounted
storage suitable for allocation. No unmounted personal/NTFS partition was touched.
Seven old floating IPs exist unassociated; none created, attached or selected.
Private subnet management route already goes through192.168.248.204, so no new FIP
is inherently needed for management SSH. Router interfaces and existing keypair read-only.

Identity has technical project admin role but no explicit delegation to create global
flavors or change shared quota. **Cloud administrator** must confirm target project,
provide4vCPU/>=8192MiB and~100GiB real capacity (or Cinder boot/data volume), and verified
image provenance. Ubuntu22.04 is now conditionally acceptable, but current Glance image
has no OS/architecture properties and no image-specific Docker/Compose execution proof;
Terraform image/RAM guards were not weakened to make unsuitable inventory apply.

PR57 HEAD `024cf1de08006b2e87a574d2d3650db7408a5b1a` adds credential-free Terraform CI.
[Terraform44259413063](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44259413063)
and [TV4 CI44259413121](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44259413121)
PASS. [Standalone BE0844259413059](https://github.com/SE2026-21-1/dao-budget-simulator/actions/runs/44259413059)
failed before tests on upstream Foundry installer HTTP403; no blind rerun. This clean
application PR recreates the source pinned installer helper. Peer review still needed;
no direct Dev push or merge bypass.

Docker Engine active but user lacks socket permission, sudo requires password; do not
chmod666 or self-grant Docker access. A permitted administrator/VM account is needed.
No Environment dao-staging, repo runtime variables/secrets, verified full-SHA GHCR release
or Sepolia metadata/RPC handoff was available. Package-list API403 lacks read:packages.
An existing SSH agent authenticated as dung0611 and was used for workflow pushes after
HTTPS OAuth refused workflow scope; no new key or scope escalation.

Keep issue56 Blocked; keep PR57 and this clean application PR In review. No new merge
or branch deletion in this follow-up while CI/review/deployment gates are unmet. Previous
three remote cleanups remain recorded in the prior handoff. No domain ownership was
established, so no demo.daobudgetsim.com DNS/HTTPS changes or domain purchase.

After approved VM/release/handoff exists, exact Compose command form is in docs/cicd.md:
project `dao`, release-specific compose.yml, shared runtime.env plus verified release.env;
config --quiet before start/reconcile, backup and explicit migration before deployment.
**There is no current real stack/project/volume to restart safely.** No VM ACTIVE/SSH,
cloud-init, target disk mount, user-reachable staging URL, rollback or k6 result is claimed.
