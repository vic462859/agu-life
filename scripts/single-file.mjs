#!/usr/bin/env node
/**
 * 把 dist/build/h5 内联成一个单文件 agu-life.html（零依赖，只用 node 内置模块）。
 *
 * 做法：
 *  - <link rel=stylesheet> / <script type=module src> 全部摘掉，CSS 合并进一个 <style>；
 *  - 每个 JS chunk 作为字符串内联进页面，运行时用 Blob + importmap 还原成模块图
 *    （产物里 entry 和 page chunk 互相 import，是环，无法简单拼字符串，所以走 blob + 裸标识符映射）；
 *  - vite 的 __vite__mapDeps 预载入依赖表被清空：CSS 已经全局内联，再按 URL 去预载只会 404；
 *  - 本地图片（若有）base64 进 data URI。
 *
 * 用法：node scripts/single-file.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve('dist/build/h5')
const outFile = path.resolve('agu-life.html')
const assetsDir = path.join(root, 'assets')

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const log = (...a) => console.log(...a)
const fail = (msg) => {
  console.error('FAIL: ' + msg)
  process.exit(1)
}

if (!fs.existsSync(path.join(root, 'index.html'))) fail('找不到 ' + path.join(root, 'index.html') + '，先跑 npm run build:h5')

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

// ---- 1. 找出 index.html 引用的 css / entry js，再补上 assets 目录里其余 chunk ----
const htmlCss = [...html.matchAll(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi)].map((m) => {
  const href = /href=["']([^"']+)["']/i.exec(m[0])
  return href ? { tag: m[0], name: path.basename(href[1]) } : null
}).filter(Boolean)

const htmlEntry = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*>\s*<\/script>/gi)].map((m) => {
  const src = /src=["']([^"']+)["']/i.exec(m[0])
  return src ? { tag: m[0], name: path.basename(src[1]) } : null
}).filter(Boolean)

if (htmlEntry.length === 0) fail('index.html 里没有 <script type="module" src=...>，无法确定入口')

const allAssetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : []
const cssNames = [
  ...htmlCss.map((x) => x.name),
  ...allAssetFiles.filter((f) => f.endsWith('.css') && !htmlCss.some((x) => x.name === f)).sort(),
]
const jsNames = [
  ...htmlEntry.map((x) => x.name),
  ...allAssetFiles.filter((f) => f.endsWith('.js') && !htmlEntry.some((x) => x.name === f)).sort(),
]
const entryName = htmlEntry[0].name

const missing = [...cssNames, ...jsNames].filter((f) => !fs.existsSync(path.join(assetsDir, f)))
if (missing.length) fail('index.html 引用的资源在 assets 里不存在：' + missing.join(', '))

// ---- 2. 本地图片 / 字体 -> data URI ----
const skipped = []
const toDataUri = (relFromHtml) => {
  const abs = relFromHtml.startsWith('/') ? path.join(root, relFromHtml) : path.resolve(path.dirname(path.join(root, 'index.html')), relFromHtml)
  const ext = path.extname(abs).toLowerCase()
  if (!MIME[ext] || !fs.existsSync(abs)) {
    skipped.push(relFromHtml)
    return null
  }
  return 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(abs).toString('base64')
}

let inlinedImages = 0
const inlineUrlTokens = (text) =>
  text.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, q, ref) => {
    if (/^(data:|https?:|blob:|#)/i.test(ref)) return whole
    const uri = toDataUri(ref)
    if (!uri) return whole
    inlinedImages++
    return 'url(' + uri + ')'
  })

// ---- 3. CSS 合成一块 <style> ----
const cssParts = []
for (const name of cssNames) {
  const file = path.join(assetsDir, name)
  cssParts.push('/* ' + name + ' */\n' + inlineUrlTokens(fs.readFileSync(file, 'utf8')))
}
const cssText = cssParts.join('\n')
if (cssText.includes('</style')) fail('CSS 里含 </style，会截断内联块')

// ---- 4. JS chunk 改写 ----
// 4a. 清空 vite 的预载入依赖表（CSS 已全局内联，按 URL 预载只会 404）
// 4b. ./xxx.js 相对说明符 -> 裸标识符 agu-mN（产物里 entry 与 page chunk 互为 import，是环，
//     只有"先建好全部 blob、再用 importmap 映射裸名"才解不开这个环）
const ver = Date.now().toString(36)
const bare = new Map(jsNames.map((name, i) => [name, 'agu-m' + i + '-' + ver]))

const jsTexts = new Map()
let neuteredDeps = 0
for (const name of jsNames) {
  let code = fs.readFileSync(path.join(assetsDir, name), 'utf8')
  code = code.replace(/__vite__mapDeps\.viteFileDeps\s*=\s*\[[^\]]*\]/g, () => {
    neuteredDeps++
    return '__vite__mapDeps.viteFileDeps = []'
  })
  code = code.replace(/__vite__mapDeps\(\s*\[[\d,\s]*\]\s*\)/g, '__vite__mapDeps([])')
  for (const [target, spec] of bare) {
    if (target === name) continue
    code = code.split('./' + target).join(spec)
  }
  jsTexts.set(bare.get(name), code)
}

// ---- 5. 组装 HTML ----
for (const { tag } of htmlCss) html = html.split(tag).join('')
for (const { tag } of htmlEntry) html = html.split(tag).join('')

const payload = JSON.stringify({ entry: bare.get(entryName), js: Object.fromEntries(jsTexts) }).replace(/<\//g, '<\\/')

const styleTag = '<style id="agu-inline-css">\n' + cssText + '\n</style>\n'
const bootTag =
  '<script id="agu-inline-modules" type="application/json">' + payload + '</script>\n' +
  `<script>
(function () {
  var data = JSON.parse(document.getElementById('agu-inline-modules').textContent)
  var ns = Object.keys(data.js)
  var urls = {}
  var imports = {}
  for (var i = 0; i < ns.length; i++) {
    urls[ns[i]] = URL.createObjectURL(new Blob([data.js[ns[i]]], { type: 'text/javascript' }))
    imports[ns[i]] = urls[ns[i]]
  }
  var im = document.createElement('script')
  im.type = 'importmap'
  im.textContent = JSON.stringify({ imports: imports })
  document.head.appendChild(im)
  var s = document.createElement('script')
  s.type = 'module'
  s.src = urls[data.entry]
  s.onerror = function () {
    document.body.insertAdjacentHTML('afterbegin', '<pre style="color:#c00">single-file: 模块加载失败</pre>')
  }
  document.head.appendChild(s)
})()
</script>\n`

// CSS 放 </head>，模块引导脚本放 </body>
html = html.includes('</head>') ? html.replace('</head>', styleTag + '</head>') : styleTag + html
html = html.includes('</body>') ? html.replace('</body>', bootTag + '</body>') : html + bootTag

// 顺带把 html 里可能存在的 <img src> 内联
html = html.replace(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi, (whole, ref) => {
  if (/^(data:|https?:|blob:)/i.test(ref)) return whole
  const uri = toDataUri(ref)
  if (!uri) return whole
  inlinedImages++
  return whole.replace(ref, uri)
})

fs.writeFileSync(outFile, html)

// ---- 6. 自检 ----
const external = [
  ...html.matchAll(/(?:src|href)=["'](?:\.\/|\/|assets\/)assets\/[^"']*["']/g),
].map((m) => m[0])
const bytes = Buffer.byteLength(html)
log('写盘: ' + path.relative(process.cwd(), outFile))
log('内联: ' + jsNames.length + ' 个 JS chunk / ' + cssNames.length + ' 个 CSS / ' + inlinedImages + ' 个图片引用')
log('清空的 vite 预载入依赖表: ' + neuteredDeps + ' 处')
log('体积: ' + bytes + ' bytes (' + (bytes / 1024).toFixed(1) + ' KiB)')
log('残留外部资源引用: ' + external.length + (external.length ? ' -> ' + external.slice(0, 5).join(', ') : ''))
if (skipped.length) log('跳过的资源（找不到或类型不支持，保持原引用）: ' + skipped.join(', '))

if (external.length) fail('仍有外部资源引用，不是单文件')
log('PASS: 单文件产物已生成，无外部资源引用')
