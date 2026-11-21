#!/usr/bin/env node
/**
 * 三个短音效，程序化生成，零素材零版权。
 * 手写 RIFF/PCM 头（不引 wav 库）+ 正弦/三角波 + 淡入淡出包络，产物落 minigame/audio/*.wav。
 *
 * 为什么是 8 kHz 单声道 16 bit：三声 beep 的目标是「听得出发生了什么」，
 * 不是 Hi-Fi；采样率和位深直接决定包体（WAV 总体积预算 40 KB）。
 *
 * 用法：node scripts/gen-sfx.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
)
const OUT = path.join(ROOT, 'minigame', 'audio')

const RATE = 8000
const BUDGET = 40 * 1024

/** 一帧三角波：p 是 0..1 的相位。 */
function tri(p) {
  return 4 * Math.abs(p - Math.floor(p + 0.5)) - 1
}

/**
 * 一段波形 → 16 bit 单声道 PCM。
 * spec: { ms, wave: 'sine'|'tri', from, to, tau, gain }
 * from→to 是线性扫频（终点是音高的落点）；tau 是包络的指数衰减时间常数（秒）。
 */
function render(spec) {
  const n = Math.round((spec.ms / 1000) * RATE)
  const attack = Math.max(1, Math.round(RATE * 0.002))
  const release = Math.max(1, Math.round(RATE * 0.002))
  const pcm = Buffer.alloc(n * 2)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    const k = n <= 1 ? 0 : i / (n - 1)
    const hz = spec.from + (spec.to - spec.from) * k
    phase += hz / RATE
    const w = spec.wave === 'tri' ? tri(phase) : Math.sin(phase * 2 * Math.PI)
    // 包络：2ms 淡入（削掉起音爆音）× 指数衰减 × 2ms 淡出（结尾不留台阶）
    let env = Math.min(1, i / attack)
    env *= Math.exp(-t / spec.tau)
    env *= Math.min(1, (n - 1 - i) / release)
    const v = Math.max(-1, Math.min(1, w * env * spec.gain))
    // 1 - 1/32768：把 +1.0 挡在 Int16 的边界内
    pcm.writeInt16LE(Math.round(v * 32767 * 0.9999), i * 2)
  }
  return pcm
}

/** 44 字节 RIFF/WAVE 头 + PCM。 */
function wav(pcm) {
  const head = Buffer.alloc(44)
  head.write('RIFF', 0, 'ascii')
  head.writeUInt32LE(36 + pcm.length, 4)
  head.write('WAVE', 8, 'ascii')
  head.write('fmt ', 12, 'ascii')
  head.writeUInt32LE(16, 16) // fmt 块长度
  head.writeUInt16LE(1, 20) // PCM
  head.writeUInt16LE(1, 22) // 单声道
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28) // byteRate = RATE × 声道 × 2
  head.writeUInt16LE(2, 32) // blockAlign
  head.writeUInt16LE(16, 34) // 位深
  head.write('data', 36, 'ascii')
  head.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([head, pcm])
}

/** 三声：点击 60ms / 结算涨 120ms / 结算跌 160ms。 */
const SPECS = [
  {
    name: 'click',
    desc: '有效点击',
    spec: { ms: 60, wave: 'sine', from: 1250, to: 1250, tau: 0.012, gain: 0.5 },
  },
  {
    name: 'up',
    desc: '结算涨',
    spec: { ms: 120, wave: 'tri', from: 660, to: 990, tau: 0.07, gain: 0.42 },
  },
  {
    name: 'down',
    desc: '结算跌',
    spec: { ms: 160, wave: 'tri', from: 440, to: 220, tau: 0.08, gain: 0.42 },
  },
]

fs.mkdirSync(OUT, { recursive: true })
let total = 0
for (const s of SPECS) {
  const buf = wav(render(s.spec))
  fs.writeFileSync(path.join(OUT, s.name + '.wav'), buf)
  total += buf.length
  console.log(
    '✓ minigame/audio/' +
      s.name.padEnd(6) +
      String(buf.length).padStart(6) +
      ' B  ' +
      s.spec.ms +
      'ms · ' +
      s.spec.wave +
      ' ' +
      s.spec.from +
      (s.spec.to === s.spec.from ? '' : '→' + s.spec.to) +
      'Hz · ' +
      s.desc,
  )
}
console.log(
  '合计 ' +
    total +
    ' B (' +
    (total / 1024).toFixed(1) +
    ' KB) / 预算 ' +
    BUDGET +
    ' B (' +
    (BUDGET / 1024).toFixed(0) +
    ' KB) — ' +
    (total <= BUDGET ? '在预算内' : '超预算'),
)
if (total > BUDGET) process.exit(1)
