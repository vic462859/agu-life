#!/usr/bin/env node
/**
 * 打包微信小游戏：minigame/game.js + src/game/** → dist-minigame/game.js（单文件 iife）。
 * 零新依赖：用已装的 esbuild（vite 自带的那个），不引引擎、不引第三方库（主包 4MB 红线）。
 * 产物目录直接可被微信开发者工具导入（game.js + game.json + project.config.json）。
 *
 * 用法：node scripts/build-minigame.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const OUT = path.join(ROOT, 'dist-minigame')
const ENTRY = path.join(ROOT, 'minigame', 'game.js')
const TARGET = path.join(OUT, 'game.js')

if (!fs.existsSync(ENTRY)) {
  console.error('✗ 找不到入口:', ENTRY)
  process.exit(1)
}

// 不删目录：微信开发者工具打开着这个工程时目录会被锁（EBUSY），只覆盖产物文件。
fs.mkdirSync(OUT, { recursive: true })

await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  minify: true,
  legalComments: 'none',
  outfile: TARGET,
  logLevel: 'warning',
})

fs.copyFileSync(path.join(ROOT, 'minigame', 'game.json'), path.join(OUT, 'game.json'))

// 音效随包走：minigame/audio/*.wav → dist-minigame/audio/（wx 的 InnerAudioContext 按相对路径取）。
// 不删目录：和 game.js 一样只覆盖文件，开发者工具打开着也不会 EBUSY。
const AUDIO_SRC = path.join(ROOT, 'minigame', 'audio')
const AUDIO_OUT = path.join(OUT, 'audio')
let audioBytes = 0
let audioN = 0
if (fs.existsSync(AUDIO_SRC)) {
  fs.mkdirSync(AUDIO_OUT, { recursive: true })
  for (const f of fs.readdirSync(AUDIO_SRC).sort()) {
    if (!f.endsWith('.wav')) continue
    const src = path.join(AUDIO_SRC, f)
    fs.copyFileSync(src, path.join(AUDIO_OUT, f))
    audioBytes += fs.statSync(src).size
    audioN += 1
  }
}

// 开发者工具的工程描述；appid 由 scripts/minigame-preview.mjs 按参数写进去。
// compileType 必须是 game —— 写 miniprogram 会报「game.json 未找到」。
const projectConfig = {
  appid: 'touristappid',
  projectname: 'agu-life-minigame',
  compileType: 'game',
  setting: {
    es6: true,
    minified: true,
    urlCheck: false,
    postcss: false,
  },
}
// 已存在就不覆盖：appid 是 minigame-preview.mjs 按参数写进去的，重打包不该把它抹掉。
const projectFile = path.join(OUT, 'project.config.json')
if (!fs.existsSync(projectFile)) {
  fs.writeFileSync(projectFile, JSON.stringify(projectConfig, null, 2) + '\n')
}

const size = fs.statSync(TARGET).size
const kb = (n) => (n / 1024).toFixed(1) + ' KB'
console.log('✓ dist-minigame/game.js          ' + kb(size))
console.log('✓ dist-minigame/game.json')
console.log(
  audioN
    ? '✓ dist-minigame/audio/            ' + audioN + ' 个 WAV，共 ' + (audioBytes / 1024).toFixed(1) + ' KB'
    : '· dist-minigame/audio/            没有音效（先跑 node scripts/gen-sfx.mjs）',
)
console.log('✓ dist-minigame/project.config.json (compileType=game，appid 由 preview 脚本写入)')
console.log('主包预算 4 MB，已用 ' + ((size / (4 * 1024 * 1024)) * 100).toFixed(2) + '%')