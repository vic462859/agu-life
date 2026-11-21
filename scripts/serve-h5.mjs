// 本地预览 dist/build/h5 的小静态服务器（H5 产物是绝对路径，必须从根目录起服）。
// 用法：node scripts/serve-h5.mjs [port]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const port = Number(process.argv[2] || 5199)
const root = path.resolve('dist/build/h5')
const types = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

http
  .createServer((req, res) => {
    let file = path.join(root, decodeURIComponent((req.url || '/').split('?')[0]))
    try {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
      if (!fs.existsSync(file)) file = path.join(root, 'index.html')
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
      fs.createReadStream(file).pipe(res)
    } catch (e) {
      res.statusCode = 500
      res.end(String(e))
    }
  })
  .listen(port, () => console.log('h5 preview on http://127.0.0.1:' + port))
