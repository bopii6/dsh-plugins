#!/usr/bin/env node
/**
 * Serve ./market over http so a DSH profile can add it as a plugin market index
 * while you develop. Customers use your real host instead; this is only for the
 * "does Discover see it" loop.
 *
 *   node serve.mjs            # http://127.0.0.1:8787/index.json
 *   PORT=9000 node serve.mjs
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, 'market')
const PORT = Number(process.env.PORT || 8791)
const TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

http.createServer((request, response) => {
  const requested = decodeURIComponent((request.url || '/').split('?')[0])
  const relative = requested === '/' ? '/index.json' : requested
  const target = path.join(ROOT, path.normalize(relative).replace(/^([/\\])+/, ''))
  if (!target.startsWith(ROOT)) {
    response.writeHead(403).end('forbidden')
    return
  }
  fs.readFile(target, (error, body) => {
    if (error) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found')
      return
    }
    response.writeHead(200, {
      'content-type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(body)
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`market index: http://127.0.0.1:${PORT}/index.json`)
})
