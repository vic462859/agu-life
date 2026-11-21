#!/usr/bin/env node
/**
 * 零依赖冒烟：起一个本地静态服务 -> 用 headless Chrome dump-dom 抓页面 -> 断言关键 DOM 出现。
 * 断言前会把 <script> 全部删掉，避免"脚本文本里恰好有这几个字"造成的假绿。
 *
 * 覆盖两个目标：
 *   1) /         dist/build/h5（正常构建产物，经静态服务）
 *   2) /single   agu-life.html（单文件产物，同样是"原样打开"）
 *
 * 用法：node scripts/smoke.mjs [port]
 * 退出码：0 全绿 / 1 有失败
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import os from 'node:os'
import process from 'node:process'

const port = Number(process.argv[2] || 5300)
const distRoot = path.resolve('dist/build/h5')
const singleFile = path.resolve('agu-life.html')

const TYPES = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  for (const c of candidates) if (fs.existsSync(c)) return c
  return null
}

const send = (res, file) => {
  if (!fs.existsSync(file)) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath === '/single' || urlPath === '/single.html') return send(res, singleFile)
  let file = path.join(distRoot, urlPath)
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) file = path.join(distRoot, 'index.html')
  send(res, file)
})

// 注意：Chrome 的 stdout 走管道时，残留的子进程会让管道不关，execFileSync 会一直等到超时；
// 所以把 stdout 落到临时文件，并只等 'exit' 事件。
const dumpDom = (chrome, url) =>
  new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agu-smoke-'))
    const outFile = path.join(tmpDir, 'dom.html')
    const fd = fs.openSync(outFile, 'w')
    const child = spawn(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--user-data-dir=' + path.join(tmpDir, 'profile'),
        '--virtual-time-budget=8000',
        '--dump-dom',
        url,
      ],
      { stdio: ['ignore', fd, 'ignore'] },
    )
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      reject(new Error('Chrome 在 90s 内没有退出：' + url))
    }, 90_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      try {
        fs.closeSync(fd)
      } catch {}
      const dom = fs.readFileSync(outFile, 'utf8')
      fs.rmSync(tmpDir, { recursive: true, force: true })
      if (!dom) return reject(new Error('Chrome 没有输出 DOM（exit=' + code + '）：' + url))
      resolve(dom)
    })
  })

/** 去掉所有 <script> 块后再断言：只认真正渲染出来的 DOM。 */
const visibleHtml = (dom) => dom.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')

const results = []
const check = async (name, fn) => {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log('PASS  ' + name)
  } catch (e) {
    results.push({ name, ok: false })
    console.log('FAIL  ' + name + ' -> ' + (e && e.message ? e.message : e))
  }
}

const assertHas = (html, needle, label) => {
  if (!html.includes(needle)) throw new Error('渲染后的 DOM 里没有 ' + label)
}

const main = async () => {
  const chrome = chromePath()
  if (!chrome) {
    console.error('FAIL: 找不到 Chrome，可用 CHROME_PATH 环境变量指定')
    process.exit(1)
  }
  if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
    console.error('FAIL: 没有 ' + path.join(distRoot, 'index.html') + '，先跑 npm run build:h5')
    process.exit(1)
  }
  if (!fs.existsSync(singleFile)) {
    console.error('FAIL: 没有 ' + singleFile + '，先跑 node scripts/single-file.mjs')
    process.exit(1)
  }

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + port
  console.log('静态服务: ' + base + '  (root=' + path.relative(process.cwd(), distRoot) + ', single=' + path.relative(process.cwd(), singleFile) + ')')

  let distDom = ''
  let singleDom = ''
  await check('dist/build/h5 能加载并渲染（' + base + '/）', async () => {
    distDom = visibleHtml(await dumpDom(chrome, base + '/'))
  })
  await check('dist/build/h5 首页出现「你从哪儿来」', () => assertHas(distDom, '你从哪儿来', '「你从哪儿来」'))
  await check('dist/build/h5 首页出现 id="org-0"（出身三选一已渲染）', () => assertHas(distDom, 'id="org-0"', 'id="org-0"'))

  await check('单文件 agu-life.html 能加载并渲染（' + base + '/single）', async () => {
    singleDom = visibleHtml(await dumpDom(chrome, base + '/single'))
  })
  await check('单文件出现「你从哪儿来」', () => assertHas(singleDom, '你从哪儿来', '「你从哪儿来」'))
  await check('单文件出现 id="org-0"', () => assertHas(singleDom, 'id="org-0"', 'id="org-0"'))

  const failed = results.filter((r) => !r.ok)
  server.close()
  if (failed.length) {
    console.log('FAIL: ' + failed.length + '/' + results.length + ' 项未通过')
    process.exit(1)
  }
  console.log('PASS: ' + results.length + '/' + results.length + ' 项全绿')
  process.exit(0)
}

main().catch((e) => {
  console.error('FAIL: ' + (e && e.message ? e.message : e))
  server.close()
  process.exit(1)
})