# BE07 API examples

Responses copied from real local Anvil/PostgreSQL run-6 evidence on 2026-10-25.
These are shape examples, not seeds, live health or synthetic BE01 acceptance.
Health HTTP: replaying/rebuild_required = 503; lagging = 200/degraded.
Cursor invalidated HTTP: 409 SNAPSHOT_INVALIDATED.
The existing sync.status enum is preserved; recoveryStatus/lastRpcCheckAt/
publicationBlock are additive. lagSeconds is an unsigned decimal string.
