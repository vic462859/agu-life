/**
 * 挑战码：把 (seed, mode) 压进一串能手抄的字符，解析永不抛异常。
 *
 * 格式 AGU-XXXXXXX：7 位 base32（字母表去掉 I L O U，避免 1/O、0/O 抄错），
 * 低位 31 位是 seed，接着 2 位是模式，最高 2 位是版本。
 * 31 + 2 + 2 = 35 bit = 7 位 × 5 bit，刚好装下，所以编码是精确可逆的。
 */
import type { Mode } from './types'

/** 码字符表：大写数字，去掉 I L O U。 */
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PREFIX = 'AGU'
const BODY_LEN = 7
const MODES: Mode[] = ['real', 'fog', 'draw']
/** 2^31：seed 的跨度。 */
const SEED_SPAN = 2147483648
/** 2^33：模式那一位开始的位置。 */
const MODE_SPAN = SEED_SPAN * 4

/** 当前码制版本。老码换了进制或字段顺序就 +1，旧码会被判“认不出”。 */
export const CHALLENGE_VERSION = 1

/** 合法挑战码的形状（前缀 + 7 位）。 */
export const CHALLENGE_SHAPE = /^AGU-[0-9A-Z]{7}$/

/** 解析失败的类别，UI 只按它给提示，不解析文案。 */
export type ChallengeReason = 'empty' | 'type' | 'chars' | 'length' | 'prefix' | 'version'

export interface ChallengeOk {
  ok: true
  code: string
  seed: number
  mode: Mode
  version: number
}

export interface ChallengeFail {
  ok: false
  reason: ChallengeReason
  /** 给人看的一句话（可直接显示）。 */
  message: string
  /** 退回随机 seed 时用的那一组，保证调用方总能开局。 */
  fallback: { seed: number; mode: Mode }
}

export type ChallengeResult = ChallengeOk | ChallengeFail

/** 把任意数字收进 seed 的合法范围（31 位无符号）。 */
export function clampSeed(seed: number): number {
  const n = Math.floor(Math.abs(Number(seed)))
  if (!isFinite(n)) return 0
  return n % SEED_SPAN
}

/** 造一个随机 seed（与 useGame 的 freshSeed 同量级，不读写任何外部状态）。 */
export function randomSeed(): number {
  return Math.floor(Math.random() * (SEED_SPAN - 1))
}

function modeIndex(mode: Mode): number {
  const i = MODES.indexOf(mode)
  return i < 0 ? 0 : i
}

/** seed + 模式 → 挑战码。任何 seed 都会被规范化，不会抛。 */
export function encodeChallenge(seed: number, mode: Mode): string {
  let n = clampSeed(seed) + modeIndex(mode) * SEED_SPAN + CHALLENGE_VERSION * MODE_SPAN
  let body = ''
  for (let i = 0; i < BODY_LEN; i++) {
    body = ALPHA.charAt(n % ALPHA.length) + body
    n = Math.floor(n / ALPHA.length)
  }
  return PREFIX + '-' + body
}

/** 宽容地把输入整成「7 位码体」：去空白、去分隔符、转大写、I/L→1、O→0。 */
function toBody(input: string): { body: string } | { reason: ChallengeReason; message: string } {
  const raw = String(input).toUpperCase().replace(/[\s_\-]+/g, '')
  if (!raw.length) return { reason: 'empty', message: '挑战码是空的，先粘一个进来。' }
  let body = raw
  if (body.length > PREFIX.length && body.slice(0, PREFIX.length) === PREFIX) {
    body = body.slice(PREFIX.length)
  } else if (body.length === PREFIX.length + BODY_LEN) {
    return { reason: 'prefix', message: '挑战码开头应该是 AGU-，这串不是。' }
  }
  if (body.length !== BODY_LEN) {
    return { reason: 'length', message: '挑战码长度不对：应该是 AGU- 加 7 位，你给的是 ' + body.length + ' 位。' }
  }
  const fixed = body.replace(/[IL]/g, '1').replace(/O/g, '0')
  for (let i = 0; i < fixed.length; i++) {
    if (ALPHA.indexOf(fixed.charAt(i)) < 0) {
      return { reason: 'chars', message: '挑战码里有不认识的字符「' + fixed.charAt(i) + '」，只允许 A–Z 和 0–9。' }
    }
  }
  return { body: fixed }
}

/**
 * 挑战码 → (seed, mode)。任何输入都返回结果对象，不抛异常：
 * 出错时带上可读的 message 和一组随机 fallback，让调用方照样能开局。
 */
export function decodeChallenge(input: unknown, fallbackSeed?: number): ChallengeResult {
  const fallback = {
    seed: clampSeed(fallbackSeed != null ? fallbackSeed : randomSeed()),
    mode: 'real' as Mode,
  }
  const fail = function (reason: ChallengeReason, message: string): ChallengeFail {
    return { ok: false, reason: reason, message: message, fallback: fallback }
  }
  if (typeof input !== 'string') return fail('type', '挑战码得是一串文字。')
  const parsed = toBody(input)
  if ('reason' in parsed) return fail(parsed.reason, parsed.message)

  let n = 0
  for (let i = 0; i < parsed.body.length; i++) {
    n = n * ALPHA.length + ALPHA.indexOf(parsed.body.charAt(i))
  }
  const version = Math.floor(n / MODE_SPAN) % 4
  if (version !== CHALLENGE_VERSION) {
    return fail('version', '这个挑战码是第 ' + version + ' 版码制，这一版认不出来。')
  }
  const seed = Math.floor(n % SEED_SPAN)
  const mode = MODES[Math.floor(n / SEED_SPAN) % 4]
  if (!mode) return fail('chars', '挑战码里的模式那几位坏了。')
  return { ok: true, code: encodeChallenge(seed, mode), seed: seed, mode: mode, version: version }
}

/** 这串是不是一个形状合法的挑战码（不做版本判定，UI 用来点亮按钮）。 */
export function isChallengeCode(input: unknown): boolean {
  return typeof input === 'string' && CHALLENGE_SHAPE.test(input.toUpperCase().trim())
}
