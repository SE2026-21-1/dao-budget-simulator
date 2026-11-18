import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const allowed = new Set(['VITE_API_BASE_URL', 'VITE_CHAIN_ID', 'VITE_DEPLOYMENT_ID', 'VITE_RPC_URL',
  'VITE_GOVERNOR_ADDRESS', 'VITE_TIMELOCK_ADDRESS', 'VITE_TREASURY_ADDRESS', 'VITE_GOV_TOKEN_ADDRESS',
  'VITE_BUD_TOKEN_ADDRESS', 'VITE_EXPLORER_URL', 'VITE_CHAIN_NAME', 'VITE_DATA_SOURCE']);
const config = JSON.parse(await readFile(process.env.PUBLIC_CONFIG_FILE ?? '/run/dao/frontend.json', 'utf8'));
if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Public config must be a JSON object');
for (const [key, value] of Object.entries(config)) {
  if (!allowed.has(key) || typeof value !== 'string') throw new Error(`Unsupported public config field: ${key}`);
}
if (config.VITE_DATA_SOURCE && config.VITE_DATA_SOURCE !== 'live') throw new Error('Container requires live data');
if (!/^[1-9][0-9]*$/.test(config.VITE_CHAIN_ID ?? '') || !Number.isSafeInteger(Number(config.VITE_CHAIN_ID)) ||
    !config.VITE_DEPLOYMENT_ID?.trim()) throw new Error('Public chain/deployment scope is required');
function publicUrl(value, field) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error(`${field} must be credential-free HTTP(S) without query or fragment`);
}
if (config.VITE_API_BASE_URL !== '/backend') publicUrl(config.VITE_API_BASE_URL, 'VITE_API_BASE_URL');
for (const key of ['VITE_RPC_URL', 'VITE_EXPLORER_URL']) if (config[key]) publicUrl(config[key], key);
// JSON is emitted as an external JS resource, never concatenated into HTML. Escape
// script-sensitive characters as well so the representation stays safe if reused.
const script = Buffer.from(`globalThis.__DAO_PUBLIC_CONFIG__ = Object.freeze(${JSON.stringify({ ...config, VITE_DATA_SOURCE: 'live' })
  .replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)});\n`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
const upstream = new URL(process.env.API_UPSTREAM ?? 'http://api:3000');
if (upstream.protocol !== 'http:' || upstream.username || upstream.password) throw new Error('Invalid internal API upstream');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let url;
  try { url = new URL(req.url, 'http://frontend'); }
  catch { res.writeHead(400); res.end(); return; }
  if (url.pathname.startsWith('/backend/api/')) {
    const proxy = request(new URL(url.pathname.slice('/backend'.length) + url.search, upstream),
      { method: req.method, headers: { accept: 'application/json', ...(req.headers.origin ? { origin: req.headers.origin } : {}) } }, response => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
    proxy.setTimeout(8000, () => proxy.destroy(new Error('API timeout')));
    proxy.on('error', () => {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end('{"error":{"code":"API_UNAVAILABLE","message":"Read API upstream is unavailable.","retryable":true,"details":{}},"context":null}');
    });
    res.on('close', () => proxy.destroy());
    proxy.end();
    return;
  }
  if (url.pathname === '/healthz') { res.writeHead(200, { 'cache-control': 'no-store' }); res.end('ok\n'); return; }
  if (url.pathname === '/runtime-config.js') {
    res.writeHead(200, { 'content-type': types['.js'], 'cache-control': 'no-store', 'content-length': script.length });
    res.end(req.method === 'HEAD' ? undefined : script); return;
  }
  try {
    const pathname = decodeURIComponent(url.pathname);
    let path = resolve(root, '.' + pathname);
    if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403); res.end(); return; }
    let info = await stat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info?.isFile()) {
      if (extname(pathname)) { res.writeHead(404); res.end(); return; }
      path = resolve(root, 'index.html'); info = await stat(path);
    }
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream',
      'cache-control': extname(path) === '.html' ? 'no-store' : 'public, max-age=3600', 'content-length': info.size });
    res.end(req.method === 'HEAD' ? undefined : await readFile(path));
  } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
});
server.listen(8080, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
