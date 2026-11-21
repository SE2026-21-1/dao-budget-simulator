#!/usr/bin/env node
// Deterministic Docker boundary for deploy.sh process regressions. Deployment,
// state snapshots, traps, identity checks and the control-session pipe stay real.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const compose = args[0] === 'compose';
const root = compose ? dirname(dirname(args[args.indexOf('--env-file') + 1])) : process.env.DAO_ROOT;
const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
const write = (name, value) => writeFileSync(join(root, name), JSON.stringify(value));
const contentId = (reference) => reference.slice(reference.indexOf('@') + 1);
if (compose) {
  const config = args.indexOf('-f');
  const release = dirname(dirname(args[config + 1]));
  const manifest = JSON.parse(readFileSync(join(release, 'manifest.json'), 'utf8'));
  const operation = args[config + 2];
  appendFileSync(join(root, 'docker.log'), JSON.stringify({ operation, sha: manifest.sha }) + '\n');
  switch (operation) {
    case 'config':
    case 'pull':
      break;
    case 'ps':
      console.log(args.at(-1));
      break;
    case 'up': {
      // Model a partial rollout before Docker reports failure, not a preflight error.
      write('running.json', { sha: manifest.sha, images: manifest.images, running: true });
      const failure = read('failure.json');
      if (failure.sha === manifest.sha && failure.phase === 'up') process.exitCode = 1;
      break;
    }
    case 'stop': {
      const running = read('running.json');
      write('running.json', { ...running, running: false });
      break;
    }
    case 'run': {
      if (!args.includes('/app/deploy/control.mjs')) throw new Error('Unexpected container command');
      const schema = readFileSync(join(root, 'schema'), 'utf8');
      const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
      try {
        console.log(`READY ${schema}`);
        for await (const line of input) {
          appendFileSync(join(root, 'docker.log'), JSON.stringify({ operation: 'control', command: line }) + '\n');
          if (line === 'RELEASE') break;
          if (line === 'SCHEMA') console.log(`SCHEMA ${schema}`);
          else if (line.startsWith('SMOKE ')) {
            const failure = read('failure.json');
            console.log(failure.phase === 'smoke' && failure.sha === read('running.json').sha ? 'SMOKE FAILED' : 'SMOKE OK');
          } else throw new Error(`Unexpected control request: ${line}`);
        }
      } finally {
        input.close();
        // The shell retains its original coprocess write FD until it exits.
        // Do not leave Node's pipe handle alive while the shell waits for us.
        process.stdin.destroy();
      }
      break;
    }
    default:
      throw new Error(`Unexpected Compose operation: ${operation}`);
  }
} else if (args[0] === 'version') console.log('test-docker');
else if (args[0] === 'image' && args[1] === 'inspect') console.log(contentId(args.at(-1)));
else if (args[0] === 'inspect') {
  const running = read('running.json');
  const reference = running.images[args.at(-1)];
  if (!reference) throw new Error('Unknown container');
  console.log(`${running.running} ${reference} ${contentId(reference)}`);
} else throw new Error(`Unexpected Docker command: ${args.join(' ')}`);
