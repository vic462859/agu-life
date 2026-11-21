<script setup lang="ts">
/**
 * 5 张板块卡（2 列紧凑卡）+「去年最猛」线索 + 每张卡一条迷你走势。
 *
 * 迷你走势画的是**该板块相对大盘的累积超额**（首点 = 100），口径写在
 * ui/share/sectorSeries.ts 的文件头：不是板块指数，也不是玩家净值。
 * 颜色只区分「选中 = 金 / 未选 = 灰」——这个游戏里红绿是涨跌语义，用在这里会误导。
 *
 * 五条线共用一把尺子（domain）：取五串数的全局 min/max，上下各留 10% 余量后传给 Sparkline。
 * 有了它，「+37.6% 的坡」才会明显比「+3.1% 的坡」陡；不传就退回每张卡各自缩放。
 *
 * V4「一屏决策」：一卡 54px 上下（书名 / 一句话 / 20px 迷你走势 + 相对强弱数字），
 * 2 列 × 3 行 ≈ 190px —— 原来 5 张竖排 735px 全部压进一屏，线、数字、线索一个没删。
 *
 * 走 canvas（2026-11 复查后恢复）：5 张同屏只画出 1~4 张的根因不在 Sparkline，而在 H5 侧
 * 那个共享的 uni-canvas 包装 —— acquire 拿到的画布不是最终显示的那一块，且测宽/重设位图发生在
 * 绘制之后。charts 层改成每张图在自己的 <view> 宿主里建独立 canvas、布局稳定后补画两次，
 * 5 张就都能落到位（dsf=1/2 实测）。梯度/填充也回来了。
 *
 * 数据全部来自页面（map / kty / uptoQi 三个 props），组件自己不去猜局面。
 */
import { computed } from 'vue'
import type { SectorId, SectorView } from '../../core'
import Sparkline from './charts/Sparkline.vue'
import { P } from '../share/palette'
import { DEFAULT_SPAN, sectorSeries } from '../share/sectorSeries'

const props = withDefaults(
  defineProps<{
    sectors: SectorView[]
    yearRow: string | null
    /** 剧本年份表（GameState.map）。 */
    map?: number[] | null
    /** 年度板块超额表（GameState.s.kty）。 */
    kty?: Record<number, Record<SectorId, number>> | null
    /** 已经走完的季度数（GameState.s.qi，不要 +1）。 */
    uptoQi?: number | null
    /** 走势窗口（季）。 */
    span?: number
  }>(),
  { map: null, kty: null, uptoQi: null, span: DEFAULT_SPAN },
)
const emit = defineEmits<{ (e: 'pick', id: SectorId): void }>()

const cards = computed(function () {
  const src = props.map && props.map.length && props.uptoQi != null
    ? { map: props.map, kty: props.kty, qi: props.uptoQi }
    : null
  return props.sectors.map(function (sv) {
    const series = src ? sectorSeries(src.map, src.kty, sv.id, src.qi, props.span) : []
    const n = series.length > 1 ? series.length - 1 : 0
    const d = n ? series[series.length - 1] - 100 : 0
    return {
      id: sv.id,
      book: sv.book,
      sub: sv.sub,
      k: sv.k,
      on: sv.on,
      series: series,
      legend: n ? '近 ' + n + ' 季' : '',
      delta: n ? (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1) + '%' : '',
      accent: sv.on ? P.gold : P.ink2,
    }
  })
})

/** 五张卡共用的一把尺子：全局 min/max 各留 10%，让坡度可以直接横向比。 */
const domain = computed<[number, number] | null>(function () {
  let lo = Infinity
  let hi = -Infinity
  const all = cards.value
  for (let i = 0; i < all.length; i++) {
    const s = all[i].series
    for (let k = 0; k < s.length; k++) {
      if (s[k] < lo) lo = s[k]
      if (s[k] > hi) hi = s[k]
    }
  }
  if (!isFinite(lo) || !isFinite(hi)) return null
  const pad = hi - lo > 1e-9 ? (hi - lo) * 0.1 : 1
  return [lo - pad, hi + pad]
})
</script>

<template>
  <view class="ag-panel ag-panel--tight">
    <view class="ag-sec-top">
      <text v-if="yearRow" class="ag-sec-clue"><text class="ag-sec-clue-ico">◈</text>{{ yearRow }}</text>
      <text v-else class="ag-sec-clue">选一个板块</text>
      <text class="ag-sec-pick">挑一个</text>
    </view>

    <view class="ag-sec-grid">
      <view
        v-for="(s, si) in cards"
        :id="'sector-' + si"
        :key="s.id"
        :class="['ag-scard', s.on ? 'ag-scard--on' : '']"
        @tap="emit('pick', s.id)"
      >
        <view class="ag-scard-r">
          <text class="ag-scard-book">{{ s.book }}</text>
          <text class="ag-scard-k">{{ s.k }}</text>
        </view>
        <view class="ag-scard-r">
          <text class="ag-scard-sub">{{ s.sub }}</text>
          <text :class="['ag-scard-tag', s.on ? 'ag-scard-tag--on' : '']">{{ s.on ? '已选' : s.legend }}</text>
        </view>
        <view class="ag-scard-spark">
          <view v-if="s.series.length > 1" class="ag-scard-cv">
            <Sparkline
              :values="s.series"
              :height="40"
              :accent="s.accent"
              :fill="true"
              :domain="domain"
            />
          </view>
          <text v-if="s.delta" :class="['ag-scard-d', s.on ? 'ag-scard-d--on' : '']">{{ s.delta }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
/* 线索行 14px + 2 列网格：整个板块区 ≈ 14 + 3×58 + 内边距 = 190px。 */
.ag-sec-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  height: 14px;
  margin-bottom: 2px;
}
.ag-sec-clue {
  font-size: 9px;
  line-height: 14px;
  color: var(--ink-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-sec-clue-ico {
  color: var(--gold-0);
  margin-right: 3px;
  font-size: 9px;
}
.ag-sec-pick {
  flex: 0 0 auto;
  margin-left: 6px;
  font-family: var(--font-mono);
  font-size: 8px;
  line-height: 14px;
  color: var(--ink-2);
  letter-spacing: 1px;
}
.ag-sec-grid {
  display: flex;
  flex-wrap: wrap;
}

/* 卡片本体 54~58px：书名 13 + 一句话 11 + 走势 20 + 内边距 10。 */
.ag-scard {
  position: relative;
  width: calc(50% - 2px);
  margin: 0 4px 4px 0;
  padding: 5px 6px 4px;
  box-sizing: border-box;
  border: 1px solid var(--line-0);
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.025);
  transition: transform var(--dur-press) var(--ease-press), filter var(--dur-press) var(--ease-press),
    border-color var(--dur-press) var(--ease-press);
}
.ag-scard:nth-child(2n) {
  margin-right: 0;
}
/* 按下态：缩放 + 提亮 + 描边（base.css 里有一份同样口径的统一规则，
   这里保留一份是因为 scoped 选择器带 data-v 属性、特异性更高，会盖掉全局那份）。 */
.ag-scard:active {
  transform: scale(var(--press-scale));
  filter: brightness(var(--press-bright));
  border-color: var(--line-2);
}
.ag-scard--on {
  border-color: var(--line-2);
  background-image: linear-gradient(160deg, rgba(246, 207, 114, 0.18) 0%, rgba(246, 207, 114, 0.04) 100%);
  box-shadow: inset 0 0 0 1px rgba(246, 207, 114, 0.24);
}
.ag-scard-r {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.ag-scard-book {
  font-size: 12px;
  line-height: 14px;
  font-weight: 700;
  color: var(--ink-0);
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-scard--on .ag-scard-book {
  color: var(--gold-0);
}
.ag-scard-k {
  flex: 0 0 auto;
  margin-left: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 12px;
  color: var(--ink-1);
}
.ag-scard-sub {
  font-size: 10px;
  line-height: 12px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-scard-tag {
  flex: 0 0 auto;
  margin-left: 4px;
  font-family: var(--font-mono);
  font-size: 8px;
  line-height: 12px;
  color: var(--ink-2);
  white-space: nowrap;
}
.ag-scard-tag--on {
  color: var(--bg-0);
  background: var(--gold-0);
  border-radius: 3px;
  padding: 0 3px;
  font-weight: 700;
}
.ag-scard-spark {
  display: flex;
  align-items: center;
  height: 20px;
  margin-top: 2px;
}
.ag-scard-cv {
  flex: 1;
  min-width: 0;
}
.ag-scard-d {
  flex: 0 0 auto;
  margin-left: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 12px;
  color: var(--ink-1);
  letter-spacing: 0.2px;
}
.ag-scard-d--on {
  color: var(--gold-0);
}
</style>
