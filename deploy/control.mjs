import { createInterface } from 'node:readline';
import { connect, lock, option, requireThat, safeFailure } from './common.mjs';
import { preflight } from './preflight.mjs';
import { smoke } from './smoke.mjs';

// One database session retains the advisory lock across image replacement and
// smoke. Losing this session makes every shell-side change fail closed.
const client = await connect().catch(safeFailure('Operation session'));
if (client) {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const closed = () => { input.close(); client.end().catch(() => {}); };
  process.once('SIGTERM', closed);
  process.once('SIGINT', closed);
  try {
    await lock(client);
    const checked = await preflight(client, option('--manifest', '/run/release/manifest.json'));
    console.log(`READY ${checked.schema}`);
    for await (const line of input) {
      if (line === 'RELEASE') break;
      if (line === 'SCHEMA') {
        try {
          const current = await preflight(client, option('--manifest', '/run/release/manifest.json'));
          console.log(`SCHEMA ${current.schema}`);
        } catch (error) { safeFailure('Schema recheck')(error); console.log('SCHEMA FAILED'); }
      } else if (line.startsWith('SMOKE ')) {
        const since = line.slice(6);
        requireThat(Number.isFinite(Date.parse(since)), 'Invalid smoke start timestamp.');
        try { await smoke(client, { since }); console.log('SMOKE OK'); }
        catch (error) { safeFailure('Smoke')(error); console.log('SMOKE FAILED'); }
      } else requireThat(false, 'Unknown deployment session command.');
    }
  } catch (error) { safeFailure('Operation session')(error); }
  finally { input.close(); await client.end().catch(() => {}); }
}
