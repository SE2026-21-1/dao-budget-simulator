import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import specification from './openapi.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const assets = new Map([
  ['/docs/swagger-ui.css', { file: 'swagger-ui.css', type: 'text/css; charset=utf-8' }],
  ['/docs/swagger-ui-bundle.js', { file: 'swagger-ui-bundle.js', type: 'text/javascript; charset=utf-8' }],
]);
const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DAO Budget Simulator API</title>
  <link rel="stylesheet" href="./swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="./swagger-ui-bundle.js" defer></script>
  <script src="./init.js" defer></script>
</body>
</html>`;
const initializer = `SwaggerUIBundle({
  url: '../openapi.json',
  dom_id: '#swagger-ui',
  validatorUrl: null
});`;
const json = JSON.stringify(specification);

export async function serveApiDocs(url: string | undefined, res: ServerResponse): Promise<boolean> {
  const path = url?.split('?', 1)[0];
  if (path === '/docs') {
    res.writeHead(308, { location: '/docs/' }).end();
    return true;
  }
  if (path === '/docs/') send(res, 'text/html; charset=utf-8', html);
  else if (path === '/docs/init.js') send(res, 'text/javascript; charset=utf-8', initializer);
  else if (path === '/openapi.json') send(res, 'application/json; charset=utf-8', json);
  else {
    const asset = path && assets.get(path);
    if (!asset) return false;
    send(res, asset.type, await readFile(require.resolve(`swagger-ui-dist/${asset.file}`)));
  }
  return true;
}

function send(res: ServerResponse, type: string, body: string | Buffer): void {
  res.writeHead(200, {
    'content-type': type, 'content-length': Buffer.byteLength(body),
    'cache-control': 'no-cache', 'x-content-type-options': 'nosniff',
  });
  res.end(body);
}
