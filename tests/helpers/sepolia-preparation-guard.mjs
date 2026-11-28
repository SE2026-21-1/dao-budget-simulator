// Child-process test guard: a preparation check must not touch network or sign anything.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import { BaseWallet } from 'ethers';
function deny() { console.error('FORBIDDEN_NETWORK_OR_SIGNING_ATTEMPT'); process.exit(90); }
globalThis.fetch = deny;
http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = net.Socket.prototype.connect = tls.connect = deny;
dns.lookup = dns.resolve = deny;
syncBuiltinESMExports();
BaseWallet.prototype.signTransaction = BaseWallet.prototype.signMessage = BaseWallet.prototype.signTypedData = deny;
