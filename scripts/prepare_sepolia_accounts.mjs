#!/usr/bin/env node
import { exportPublic, fail, initialize, parseArgs } from './sepolia_account_preparation.mjs';
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help') {
    console.log('Offline metadata only; no wallet generation.\nnode scripts/prepare_sepolia_accounts.mjs <init|export> --directory <absolute-private-path> --approved-source <full-approved-SHA> --signer-owner <custodian-name>\nCreate encrypted wallets privately with cast wallet new as documented; init/export never overwrite existing files.');
  } else {
    const options = parseArgs(args, ['--directory', '--approved-source', '--signer-owner']);
    if (!['init', 'export'].includes(command)) throw new Error('Invalid command');
    console.log(JSON.stringify(await (command === 'init' ? initialize : exportPublic)(options['--directory'], options['--approved-source'], options['--signer-owner']), null, 2));
  }
} catch (error) { fail(error); }
