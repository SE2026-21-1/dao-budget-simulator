#!/usr/bin/env node
import { fail, parseArgs, validatePrepared } from './sepolia_account_preparation.mjs';
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Offline unlock/address check only; never calls a signer.\nnode scripts/validate_sepolia_accounts.mjs --directory <absolute-private-path> --approved-source <full-approved-SHA> --signer-owner <custodian-name> --password-fd <inherited-FD>=3 --demo-password-fd <different-inherited-FD>=3\nPasswords only through inherited descriptors; see Bash hidden-prompt procedure. No password/key arguments or export.');
  } else {
    const options = parseArgs(args, ['--directory', '--approved-source', '--signer-owner', '--password-fd', '--demo-password-fd']);
    console.log(JSON.stringify(await validatePrepared(options['--directory'], options['--approved-source'], options['--signer-owner'],
      Number(options['--password-fd']), Number(options['--demo-password-fd'])), null, 2));
  }
} catch (error) { fail(error); }
