/** 中文排版：逐字换行 + 省略号截断。宽度全部由注入的 measure 提供，不碰平台。 */
export type Measure = (s: string) => number

/** 行首禁则：这些字符不另起一行（允许它把上一行略微顶宽）。 */
const NO_HEAD = '，。、；：？！）》」』】…—·%'

/** 逐字换行。返回每一行的原文片段，拼起来等于输入（换行符本身除外）。 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const out: string[] = []
  const paras = String(text == null ? '' : text).split('\n')
  for (const p of paras) {
    if (!p) continue
    let line = ''
    for (const ch of p) {
      if (!line) {
        line = ch
        continue
      }
      const next = line + ch
      if (measure(next) <= maxWidth) {
        line = next
        continue
      }
      if (NO_HEAD.indexOf(ch) >= 0) {
        out.push(next)
        line = ''
        continue
      }
      out.push(line)
      line = ch
    }
    if (line) out.push(line)
  }
  return out
}

/** 截到一行并补省略号（省略号本身都放不下时返回空串）。 */
export function ellipsize(line: string, maxWidth: number, measure: Measure, tail: string = '…'): string {
  if (measure(tail) > maxWidth) return ''
  let acc = ''
  for (const ch of String(line == null ? '' : line)) {
    if (measure(acc + ch + tail) > maxWidth) break
    acc += ch
  }
  return acc + tail
}

/** 放得下就原样返回，放不下才截断。 */
export function truncate(text: string, maxWidth: number, measure: Measure, tail: string = '…'): string {
  const s = String(text == null ? '' : text)
  if (measure(s) <= maxWidth) return s
  return ellipsize(s, maxWidth, measure, tail)
}

/** 先换行，超过 maxLines 就把最后一行截断补省略号。 */
export function fitLines(text: string, maxWidth: number, maxLines: number, measure: Measure): string[] {
  const all = wrapText(text, maxWidth, measure)
  if (all.length <= maxLines) return all
  const kept = all.slice(0, maxLines)
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1], maxWidth, measure)
  return kept
}
