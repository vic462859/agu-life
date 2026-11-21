// H5 截图用的静态服务（开发工具）：先给 docs/shots，再给 dist/build/h5。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('.')
const dirs = [path.join(root, 'docs/shots'), path.join(root, 'dist/build/h5')]
const types = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }

http.createServer(function (req, res) {
  const clean = decodeURIComponent((req.url || '/').split('?')[0])
  const tryList = clean === '/' ? ['/index.html'] : [clean, '/index.html']
  for (const rel of tryList) {
    for (const d of dirs) {
      const file = path.join(d, rel)
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
        return
      }
    }
  }
  res.statusCode = 404
  res.end('not found')
}).listen(Number(process.argv[2] || 5212), '127.0.0.1', function () {
  console.log('h5 shot on ' + (process.argv[2] || 5212))
})
