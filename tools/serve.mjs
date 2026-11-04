#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

export function createStaticServer(directory, prefix = '/') {
  const root = fs.realpathSync(directory);
  if (!/^\/(?:[\w.-]+\/)*$/.test(prefix))
    throw Error('Base path must start/end with /, e.g. /KPEX100-Reunion/');
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405).end();
    let name;
    try {
      name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      return response.writeHead(400).end();
    }
    if (prefix !== '/' && name === prefix.slice(0, -1))
      return response.writeHead(301, { Location: prefix }).end();
    if (!name.startsWith(prefix) || name.includes('\\') || name.includes('\0'))
      return response.writeHead(404).end();
    name = name.slice(prefix.length);
    if (!name || name.endsWith('/')) name += 'index.html';
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    try {
      const resolved = fs.realpathSync(file);
      if (!resolved.startsWith(root + path.sep) || !fs.statSync(resolved).isFile())
        return response.writeHead(404).end();
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Content-Length': fs.statSync(resolved).size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') return response.end();
      fs.createReadStream(resolved)
        .on('error', () => response.destroy())
        .pipe(response);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = { root: 'web', base: '/', port: process.env.PORT || '5174' };
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, '');
    if (!(key in options) || !process.argv[i + 1])
      throw Error('Usage: node tools/serve.mjs [--root web|site] [--base /repo/] [--port 5174]');
    options[key] = process.argv[i + 1];
  }
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port');
  const server = createStaticServer(path.resolve(project, options.root), options.base);
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`Reunion: http://127.0.0.1:${server.address().port}${options.base}`),
  );
}
