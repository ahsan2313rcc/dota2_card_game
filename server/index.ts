import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { attachMultiplayer } from './listen.ts'

const port = Number(process.env.PORT) || 5741
const root = join(process.cwd(), 'dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)
  if (pathname === '/ws') return
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let file = normalize(join(root, relative))
  if (!file.startsWith(root)) {
    res.writeHead(403).end()
    return
  }
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404).end('Build the client first: npm run build')
    return
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

attachMultiplayer(httpServer)
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Dota2 Card Game: Ancient's Duel  http://localhost:${port}`)
})
