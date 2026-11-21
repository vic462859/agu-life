#!/usr/bin/env node
/**
 * 一键把 dist-minigame 导入微信开发者工具并生成【小游戏】预览二维码。
 *
 * 前置（只做一次）：
 *   1) 已安装微信开发者工具，并已扫码登录（islogin 返回 {"login":true}）
 *   2) AppID 必须来自【小游戏】账号 —— 小程序 AppID 打开小游戏工程会报
 *      「game.json: 未找到 game.json 文件」（实测，见 docs/mp-preview.md）
 *
 * 用法：node scripts/minigame-preview.mjs wx1234567890abcdef [--build]
 *   产物：docs/shots/minigame-qr.jpg —— 注意工具输出的二维码实际是 JPEG，不是 PNG。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const PROJ = path.join(ROOT, 'dist-minigame')
const QR = path.join(ROOT, 'docs', 'shots', 'minigame-qr.jpg')
const CLI = 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat'

const appid = process.argv[2]
if (!appid || !/^wx[0-9a-f]{16}$/.test(appid)) {
  console.error('用法: node scripts/minigame-preview.mjs wx<16位hex> [--build]')
  console.error('（AppID 必须是【小游戏】账号；小程序号会报 game.json 缺失）')
  process.exit(2)
}
if (!fs.existsSync(CLI)) {
  console.error('未找到微信开发者工具 CLI:', CLI)
  process.exit(3)
}

if (!fs.existsSync(path.join(PROJ, 'game.js')) || process.argv.includes('--build')) {
  console.log('--- 先打包小游戏');
  const b = spawnSync('npm', ['run', 'game:build'], { cwd: ROOT, shell: true, stdio: 'inherit' })
  if (b.status !== 0) process.exit(b.status || 1)
}

// 工程描述：compileType 必须是 game，appid 每次按参数覆盖
const pc = path.join(PROJ, 'project.config.json')
const cfg = fs.existsSync(pc) ? JSON.parse(fs.readFileSync(pc, 'utf8')) : {}
cfg.appid = appid
cfg.compileType = 'game'
fs.writeFileSync(pc, JSON.stringify(cfg, null, 2) + '\n')
console.log('appid ->', appid, '(compileType=game)')

const proj = PROJ.replace(/\\/g, '/')
const qr = QR.replace(/\\/g, '/')
fs.mkdirSync(path.dirname(QR), { recursive: true })
if (fs.existsSync(QR)) fs.rmSync(QR)

/** cli.bat 在 Windows 上必须经 shell 起，且路径带空格 —— 整条命令要带引号。 */
function run(args, timeout = 180000) {
  const r = spawnSync('"' + CLI + '"', args, { shell: true, encoding: 'utf8', timeout })
  const out = ((r.stdout || '') + (r.stderr || '')).trim()
  if (out) console.log(out.slice(-800))
  if (r.error) console.log('spawn error:', r.error.message)
  return r.status
}

console.log('--- 打开工程')
run(['open', '--project', proj])

console.log('--- 生成预览二维码')
const code = run(['preview', '--project', proj, '--qr-format', 'image', '--qr-output', qr])

if (fs.existsSync(QR)) {
  const size = fs.statSync(QR).size
  console.log('✓ 预览二维码: docs/shots/minigame-qr.jpg (' + size + ' 字节)')
  process.exit(0)
}
console.error('✗ 未生成二维码（看上面报错；game.json 相关 = AppID 不是小游戏号）')
process.exit(code === 0 ? 1 : code || 1)
