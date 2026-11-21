// 文案保真检查：把原 game.js 里所有 log('...') 的字面量片段抽出来，逐条确认它们还在 src/ 里。
// 用于人工比对之外的机器兜底（拼接型日志只比对字面量片段）。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const srcPath = process.argv[2] || resolve(root, '../default-workspace/.tmp-game/src/game.js')
const game = readFileSync(srcPath, 'utf8')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}
const mine = walk(resolve(root, 'src'))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n')

// 只取含中文、长度 >= 6 的 log 字面量片段
const frags = new Set()
const re = /log\(\s*'([^']*)'/g
let m
while ((m = re.exec(game))) {
  const s = m[1]
  if (s.length >= 6 && /[\u4e00-\u9fa5]/.test(s)) frags.add(s)
}
// 事件文案里 log 的第一段形如 '　' 的短串跳过
const missing = []
for (const f of frags) {
  const probe = f.replace(/\\n/g, '').trim()
  if (probe.length < 6) continue
  if (!mine.includes(probe)) missing.push(f)
}
console.log('log 字面量片段总数:', frags.size)
console.log('src/ 里缺失的片段:', missing.length)
for (const f of missing) console.log('  MISSING:', JSON.stringify(f))
process.exit(missing.length === 0 ? 0 : 1)
