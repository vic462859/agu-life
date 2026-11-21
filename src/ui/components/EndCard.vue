<script setup lang="ts">
/**
 * 结局卡：这一局的高光时刻。
 * 主视觉 = 36 年指数长图（数据来自 core 的 buildQuarters，几何在 share/endChart.ts），
 * 右上角 48px 头像只做身份标识，右下角一件象征物（stillLifeFor 决定）。
 * 六层依次揭示（主视觉 → 金额 → 复盘 → 档案 → 与指数的对比 → 彩蛋），每层 ≤300ms，可一键跳过。
 */
import { computed, getCurrentInstance, nextTick, onUnmounted, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { buildQuarters, deserialize, fmt, indexMultipleText, SAVE_KEY, type EndView } from '../../core'
import { useCountUp } from '../composables/useCountUp'
import { eraOf, eraList } from '../composables/useEra'
import { createStorage } from '../../platform/storage'
import { acquireCanvas, type CanvasHandle } from './charts/canvas'
import { drawBust, drawStillLife } from '../share/portrait'
import { layoutEndChart, stillLifeFor, yearlySeries, type StillKind } from '../share/endChart'
import ChallengeCode from './ChallengeCode.vue'

const props = defineProps<{
  end: EndView
  asset: number
  /** 这一局最后走到的年份，用来给结局卡套年代主题。 */
  endYear: number
  /** 跳过动画（全局开关）。 */
  fast: boolean
  /** 本局挑战码（seed + 模式编码），结局页给人抄走。 */
  code: string
  /** 本局带的天赋名（没带就是空串）。挑战码里不含它，所以必须单独标明。 */
  talent?: string
  /** 这一局结算到的记忆点（0 = 没加，例如同一局重复进结局页）。 */
  points?: number
}>()
const emit = defineEmits<{
  (e: 'restart'): void
  (e: 'poster'): void
}>()

/** 6 层：0=都没出现 */
const LAST = 6
const stage = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function stop(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function reveal(): void {
  stop()
  if (props.fast) {
    stage.value = LAST
    return
  }
  stage.value = 0
  timer = setInterval(function () {
    stage.value = stage.value + 1
    if (stage.value >= LAST) stop()
  }, 260)
}

reveal()
watch(function () { return props.fast }, reveal)
onUnmounted(stop)

function skip(): void {
  stage.value = LAST
  stop()
}
function on(n: number): boolean {
  return stage.value >= n
}

const shown = useCountUp(function () { return props.asset }, 900)
const bigText = computed(function () { return fmt(shown.value) })

const era = computed(function () { return eraOf(props.endYear) })
const ribbons = computed(function () { return eraList() })

/* --- 36 年指数序列：从这一局的存档里取 map（与顶栏同一份），再按 core 的口径展开 --- */
const chartValues = (function (): number[] {
  try {
    const g = deserialize(createStorage().get(SAVE_KEY))
    if (!g || !g.map || !g.map.length) return []
    const q = buildQuarters(g.map)
    return yearlySeries(q.map(function (it) { return it.p0 }))
  } catch (e) {
    return []
  }
})()

// 指数倍数只有一个来源：core 的 indexSpan（M 的真实首尾）。
// 年线首尾是抽样（1991 Q1 → 2026 Q4 起点），拿它算会得到 30×，与正文的 27.7 倍打架。

function rowNum(label: string): number {
  for (let i = 0; i < props.end.rows.length; i++) {
    if (props.end.rows[i].label !== label) continue
    const n = parseFloat(String(props.end.rows[i].value).replace(/[^0-9.-]/g, ''))
    return isFinite(n) ? n : 0
  }
  return 0
}

const stillKind = computed<StillKind>(function () { return stillLifeFor(props.end) })
const indexLabel = indexMultipleText()
const youLabel = rowNum('倍数').toFixed(rowNum('倍数') >= 10 ? 0 : 1) + '×'

/** 分享文案：两边都取上面这两个已经有口径的数，不新造指标。 */
const shareText = computed(function () { return '同一局：指数 ' + indexLabel + ' / 你 ' + youLabel })

/* --- 三块画布：长图 / 头像 / 象征物 --- */
const CHART_H = 180
const FACE_H = 48
const STILL_BOX = 76

const inst = getCurrentInstance()
const cid = 'ag-end-chart-' + (inst ? inst.uid : 0)
const fid = 'ag-end-face-' + (inst ? inst.uid : 0)
const sid = 'ag-end-still-' + (inst ? inst.uid : 0)

const chartMode = ref<'canvas' | 'css'>('canvas')
const faceMode = ref<'canvas' | 'css'>('canvas')
const stillMode = ref<'canvas' | 'css'>('canvas')
let dead = false

const chartStyle = computed(function () { return 'height:' + CHART_H + 'px' })
const chartCv = computed(function () { return 'width:100%;height:' + CHART_H + 'px;display:block' })
const faceStyle = computed(function () { return 'height:' + FACE_H + 'px;width:' + Math.round(FACE_H * 0.8) + 'px' })
const faceCv = computed(function () { return 'width:100%;height:' + FACE_H + 'px;display:block' })
const stillStyle = computed(function () { return 'height:' + STILL_BOX + 'px;width:' + STILL_BOX + 'px' })
const stillCv = computed(function () { return 'width:100%;height:' + STILL_BOX + 'px;display:block' })

/** 长图：面积一层 + 折线一条（填充成的窄带，不用 stroke）+ 两个标记点。 */
function paintChart(h: CanvasHandle): void {
  const ctx = h.ctx
  ctx.clearRect(0, 0, h.width, h.height)
  const layout = layoutEndChart(chartValues, h.width, h.height, 6, true)
  const pts = layout.points
  if (pts.length < 2) return
  // 面积
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = '#3ee0cb'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, layout.baseY)
  for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.lineTo(pts[pts.length - 1].x, layout.baseY)
  ctx.fill()
  ctx.restore()
  // 折线：上沿 + 反向下沿围成一条 2px 宽的带，一次 fill
  const half = 1.1
  ctx.save()
  ctx.fillStyle = '#f6cf72'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y - half)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y - half)
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + half)
  ctx.fill()
  ctx.restore()
  // 进场 / 离场标记
  ctx.save()
  ctx.globalAlpha = 0.8
  ctx.fillStyle = '#9fadbe'
  const bar = function (bx: number): void {
    ctx.beginPath()
    ctx.moveTo(bx, 0)
    ctx.lineTo(bx + 2, 0)
    ctx.lineTo(bx + 2, layout.baseY)
    ctx.lineTo(bx, layout.baseY)
    ctx.fill()
  }
  bar(Math.round(layout.xFirst))
  bar(Math.round(layout.xLast) - 1)
  ctx.restore()
  // 进场点 + 离场游标
  ctx.save()
  ctx.fillStyle = '#eaf1f8'
  const p0 = pts[0]
  const pn = pts[pts.length - 1]
  ctx.beginPath()
  ctx.arc(p0.x, p0.y, 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(pn.x, pn.y, 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function paintFace(h: CanvasHandle): void {
  h.ctx.clearRect(0, 0, h.width, h.height)
  drawBust(h.ctx, {
    age: 85,
    wealth: rowNum('倍数') >= 50 ? 4 : rowNum('倍数') >= 20 ? 3 : rowNum('倍数') >= 5 ? 2 : rowNum('倍数') >= 1 ? 1 : 0,
    health: rowNum('身体'),
    family: rowNum('家'),
    record: rowNum('案底'),
    mood: props.end.title.indexOf('爆仓') >= 0 ? 'bust' : rowNum('身体') < 20 ? 'sick' : rowNum('倍数') >= 20 ? 'up' : 'calm',
  }, 0, 0, h.width, h.height, { ground: false })
}

function paintStill(h: CanvasHandle): void {
  h.ctx.clearRect(0, 0, h.width, h.height)
  drawStillLife(h.ctx, stillKind.value, 0, 0, h.width, h.height)
}

async function paintAll(): Promise<void> {
  if (dead) return
  const jobs: Promise<void>[] = []
  const run = async function (
    id: string,
    height: number,
    setMode: (m: 'canvas' | 'css') => void,
    draw: (h: CanvasHandle) => void,
  ): Promise<void> {
    const h = await acquireCanvas(id, inst, height)
    if (dead) return
    if (!h) {
      setMode('css')
      return
    }
    await nextTick()
    draw(h)
  }
  jobs.push(run(cid, CHART_H, function (m) { chartMode.value = m }, paintChart))
  jobs.push(run(fid, FACE_H, function (m) { faceMode.value = m }, paintFace))
  jobs.push(run(sid, STILL_BOX, function (m) { stillMode.value = m }, paintStill))
  await Promise.all(jobs)
}

onMounted(function () {
  nextTick(function () {
    void paintAll()
  })
})
onBeforeUnmount(function () {
  dead = true
})
watch(stillKind, function () {
  void paintAll()
})
</script>

<template>
  <view id="end-card" class="ag-screen">
    <view :class="['ag-end-hero', 'ag-era-body', era.cls, 'ag-rise', on(1) ? 'ag-rise--in' : '']">
      <view class="ag-era-tex" />
      <view class="ag-end-top">
        <view class="ag-end-face" :style="faceStyle">
          <canvas :id="fid" :canvas-id="fid" class="ag-end-face-cv" :style="faceCv"></canvas>
        </view>
        <view class="ag-end-mid">
          <text class="ag-end-kick">2051 · 八十五岁</text>
          <view class="ag-end-mark">
            <text class="ag-end-mark-i">指数 {{ indexLabel }}</text>
            <text class="ag-end-mark-y">你 {{ youLabel }}</text>
          </view>
        </view>
        <view class="ag-end-still" :style="stillStyle">
          <canvas :id="sid" :canvas-id="sid" class="ag-end-still-cv" :style="stillCv"></canvas>
        </view>
      </view>
      <view class="ag-end-chart" :style="chartStyle">
        <canvas :id="cid" :canvas-id="cid" class="ag-end-chart-cv" :style="chartCv"></canvas>
        <text class="ag-end-lb-l">进场</text>
        <text class="ag-end-lb-r">离场</text>
      </view>
      <view :class="['ag-end-title', 'ag-era-head']">{{ end.title }}</view>
      <view class="ag-end-note">{{ end.note }}</view>
      <view class="ag-era-ribbon">
        <text
          v-for="e in ribbons"
          :key="e.key"
          :class="['ag-era-chip', e.cls]"
        >{{ e.label }}</text>
      </view>
    </view>
    <view :class="['ag-end-hero', 'ag-rise', on(2) ? 'ag-rise--in' : '']">
      <view class="ag-end-num">¥{{ bigText }}</view>
      <view class="ag-end-note" style="font-size: 24rpx">{{ end.willNote }}</view>
    </view>

    <view :class="['ag-panel', 'ag-rise', on(3) ? 'ag-rise--in' : '']">
      <view class="ag-panel-hd">
        <text class="ag-kick">三十六年复盘</text>
        <text class="ag-panel-hd-r">{{ end.rows.length }} 项</text>
      </view>
      <view class="ag-ledger">
        <view v-for="r in end.rows" :key="r.label" class="ag-ledger-i">
          <text class="ag-ledger-l">{{ r.label }}</text>
          <text class="ag-ledger-v">{{ r.value }}</text>
        </view>
      </view>
    </view>

    <view :class="['ag-panel', 'ag-rise', on(4) ? 'ag-rise--in' : '']">
      <view class="ag-panel-hd">
        <text class="ag-kick">档案</text>
        <text class="ag-panel-hd-r">一局一个人</text>
      </view>
      <view v-for="(line, i) in end.profile" :key="'p' + i" class="ag-profile-i">{{ line }}</view>
    </view>

    <view :class="['ag-panel', 'ag-panel--flat', 'ag-rise', on(5) ? 'ag-rise--in' : '']">
      <text class="ag-kick">那三十六年</text>
      <view class="ag-p" style="margin-top: 10rpx">{{ end.epochHead }}</view>
      <view class="ag-p" style="color: var(--gold-0); margin-bottom: 0">{{ end.epochTail }}</view>
    </view>

    <view :class="['ag-end-cc', 'ag-rise', on(5) ? 'ag-rise--in' : '']">
      <view v-if="points" id="end-points" class="ag-end-points">
        <text class="ag-end-points-k">这一局留下</text>
        <text class="ag-end-points-v">记忆点 +{{ points }}</text>
      </view>
      <ChallengeCode :code="code" :share="shareText" :talent="talent" label="本局挑战码 · 同一局重开" />
    </view>

    <view :class="['ag-egg', 'ag-rise', on(6) ? 'ag-rise--in' : '']">{{ end.egg }}</view>

    <view :class="['ag-end-actions', 'ag-rise', on(6) ? 'ag-rise--in' : '']">
      <button id="gen-poster" class="ag-btn ag-btn--primary" @tap="emit('poster')">生成战报</button>
      <button id="end-restart" class="ag-btn" @tap="emit('restart')">再来一次</button>
    </view>

    <view v-if="!on(6)" id="end-skip" class="ag-skip" @tap="skip">跳过</view>
  </view>
</template>

<style scoped>
.ag-end-chart {
  position: relative;
  width: 100%;
  margin: 6rpx 0 18rpx;
  border-radius: var(--r-lg);
  background:
    radial-gradient(140% 120% at 50% 0%, rgba(246, 207, 114, 0.08), rgba(246, 207, 114, 0) 62%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0));
  overflow: hidden;
}
.ag-end-chart-cv {
  display: block;
}
.ag-end-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10rpx;
}
.ag-end-face {
  position: relative;
  border-radius: 8rpx;
  overflow: hidden;
  background: rgba(6, 9, 13, 0.55);
  border: 1px solid var(--line-0);
}
.ag-end-face-cv {
  display: block;
}
.ag-end-still {
  position: relative;
}
.ag-end-still-cv {
  display: block;
}
.ag-end-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ag-end-mark {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  margin-top: 4rpx;
}
.ag-end-mark-i {
  margin-right: 18rpx;
}
.ag-end-mark-i {
  font-family: var(--font-mono);
  font-size: 22rpx;
  letter-spacing: 1rpx;
  color: var(--teal-0);
}
.ag-end-mark-y {
  font-family: var(--font-mono);
  font-size: 26rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
  color: var(--gold-0);
}
.ag-end-lb-l,
.ag-end-lb-r {
  position: absolute;
  bottom: 4rpx;
  font-family: var(--font-mono);
  font-size: 20rpx;
  letter-spacing: 2rpx;
  color: var(--ink-2);
}
.ag-end-lb-l {
  left: 12rpx;
}
.ag-end-lb-r {
  right: 12rpx;
}
.ag-end-cc {
  margin: 18rpx 0 6rpx;
}
.ag-end-points {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding: 14rpx 20rpx;
  margin-bottom: 12rpx;
  border: 1px solid var(--line-0);
  border-radius: var(--r-lg);
  background: rgba(255, 255, 255, 0.02);
}
.ag-end-points-k {
  font-size: 22rpx;
  letter-spacing: 2rpx;
  color: var(--ink-2);
}
.ag-end-points-v {
  font-family: var(--font-mono);
  font-size: 28rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
  color: var(--gold-0);
}
</style>