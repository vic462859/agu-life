<script setup lang="ts">
/**
 * 顶部资产区：小头像（纯代码画的剪影）+ 大字资产（补间）+ delta + 年龄/连盈 chip + 家/身体两条进度条。
 * 头像随状态变化：年龄/财富/健康/家庭/案底/情绪 —— 一眼看出这个人过成什么样了。
 *
 * 两种版式：
 * - 面板版（默认）：头像独占一行抬头，资产数字 76rpx。
 * - compact（交易页一屏决策）：头像与数字并排一行（40px 高），两条人生条压成 22px，
 *   账户走势不再默认画出来 —— 折在一行「走势 ▸」后面，点开才画（信息没删，只是不占地方）。
 */
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { fmt, type TradeView } from '../../core'
import { useCountUp } from '../composables/useCountUp'
import { motionMs } from '../composables/motion'
import Sparkline from './charts/Sparkline.vue'
import { acquireCanvas, type CanvasHandle } from './charts/canvas'
import { drawPortrait, portraitFromTradeView, type PortraitSpec } from '../share/portrait'

const props = defineProps<{
  view: TradeView
  delta: number | null
  deltaPct: number | null
  deltaLabel: string
  trail: number[]
  /** 跳过动画：数字补间直接到位。 */
  fast?: boolean
  /** 直接给一张脸；不给就按 TradeView 推。 */
  portrait?: PortraitSpec | null
  /** 一屏决策版：整块压在 95px 以内。 */
  compact?: boolean
  /** 走势（账户曲线）是否展开：折叠状态由页面拿着，这里只画。 */
  showTrail?: boolean
}>()
const emit = defineEmits<{ (e: 'toggle-trail'): void }>()

/* 补间的时长只有一个来源：motionMs('count')（tokens.css 的 --dur-count，≤460ms）。
   "跳过动画"开关与 prefers-reduced-motion 都经由它返回 0 —— 数值直接到位，其它一切不变。 */
function ms(): number {
  return props.fast ? 0 : motionMs('count')
}

const shown = useCountUp(function () { return props.view.asset }, ms)
const assetText = computed(function () { return fmt(shown.value) })

/* 本季 Δ 与它后面的百分比也是两个补间的数字：同一个 tick 里各起一条，同时开始、同时到。
   （不是"资产滚完再滚 delta"—— 那样一次推进的反馈会拖成 1 秒以上。） */
const shownDelta = useCountUp(function () { return props.delta === null ? 0 : props.delta }, ms)
const shownPct = useCountUp(function () { return props.deltaPct === null ? 0 : props.deltaPct }, ms)

const deltaTone = computed(function () {
  if (props.delta === null) return 'ag-delta--f'
  if (props.delta > 0.5) return 'ag-delta--u'
  if (props.delta < -0.5) return 'ag-delta--d'
  return 'ag-delta--f'
})
const deltaText = computed(function () {
  if (props.delta === null) return '—'
  const d = shownDelta.value
  const p = shownPct.value
  const sign = d > 0.5 ? '+' : d < -0.5 ? '−' : ''
  const pct = props.deltaPct === null ? '' : '（' + (p > 0.05 ? '+' : p < -0.05 ? '−' : '') + Math.abs(p).toFixed(1) + '%）'
  return sign + fmt(Math.abs(d)) + pct
})

/* --- 小头像：48px 高（紧凑版 40px），画的是同一个人（随状态变） --- */
const phH = computed(function () { return props.compact ? 40 : 48 })
const inst = getCurrentInstance()
const pid = 'agph-' + (inst ? inst.uid : 0)
const phMode = ref<'canvas' | 'css'>('canvas')
const phHandle = ref<CanvasHandle | null>(null)
let dead = false

const spec = computed(function () {
  return props.portrait ? props.portrait : portraitFromTradeView(props.view)
})
const phStyle = computed(function () {
  return 'width:' + Math.round(phH.value * 0.78) + 'px;height:' + phH.value + 'px'
})
const phCvStyle = computed(function () {
  return 'width:100%;height:' + phH.value + 'px;display:block'
})

function paintCanvas(h: CanvasHandle): void {
  h.ctx.clearRect(0, 0, h.width, h.height)
  // 小尺寸关掉光晕和地面投影：48px 里它们只会糊成一块
  drawPortrait(h.ctx, spec.value, 0, 0, h.width, h.height, { halo: false, ground: false })
}

async function paint(): Promise<void> {
  if (dead) return
  let h = phHandle.value
  if (!h) {
    h = await acquireCanvas(pid, inst, phH.value)
    if (dead) return
    if (!h) {
      phMode.value = 'css'
      phHandle.value = null
      return
    }
    phHandle.value = h
    phMode.value = 'canvas'
    await nextTick()
  }
  paintCanvas(h)
}

onMounted(function () {
  nextTick(function () {
    void paint()
  })
})
onBeforeUnmount(function () {
  dead = true
})
watch(spec, function () {
  void paint()
}, { deep: true })
</script>

<template>
  <view :class="['ag-panel', compact ? 'ag-panel--tight' : '']">
    <template v-if="compact">
      <view class="ag-c-row">
        <view class="ag-ph" :style="phStyle">
          <template v-if="phMode === 'canvas'">
            <!-- #ifdef MP-WEIXIN -->
            <canvas :id="pid" type="2d" class="ag-ph-cv" :style="phCvStyle" />
            <!-- #endif -->
            <!-- #ifdef H5 -->
            <canvas :id="pid" :canvas-id="pid" class="ag-ph-cv" :style="phCvStyle" />
            <!-- #endif -->
          </template>
          <view v-else class="ag-ph-fb" />
        </view>

        <view class="ag-c-main">
          <view class="ag-c-num">
            <text class="ag-cur ag-cur--c">¥</text>
            <text class="ag-big ag-big--c">{{ assetText }}</text>
            <text class="ag-chip ag-chip--c">{{ view.age }} 岁</text>
            <text
              v-if="view.streak.tone !== 'none'"
              :class="['ag-chip', 'ag-chip--c', view.streak.tone === 'win' ? 'ag-chip--win' : 'ag-chip--lose']"
            >{{ view.streak.text }}</text>
          </view>
          <view class="ag-asset-sub ag-asset-sub--c">
            <text :class="['ag-delta', 'ag-delta--c', deltaTone]">{{ deltaLabel }} {{ deltaText }}</text>
            <text class="ag-asset-where ag-asset-where--c">{{ view.yearText }} · Q{{ view.quarter }}{{ view.whereText ? ' · ' + view.whereText : '' }}</text>
          </view>
        </view>
      </view>

      <view class="ag-c-bars">
        <view class="ag-brow ag-brow--c" v-for="b in view.bars" :key="b.key">
          <text class="ag-brow-l ag-brow-l--c">{{ b.label }}</text>
          <view class="ag-brow-track ag-brow-track--c">
            <view :class="['ag-brow-fill', 'ag-fill--' + b.tone]" :style="{ width: b.value + '%' }" />
            <view class="ag-thr ag-thr--1" />
            <view class="ag-thr ag-thr--2" />
          </view>
          <text class="ag-brow-v ag-brow-v--c">{{ b.value }}</text>
        </view>
      </view>

      <view id="trail-fold" class="ag-c-fold" @tap="emit('toggle-trail')">
        <text class="ag-c-fold-k">走势</text>
        <text class="ag-c-fold-v">账户曲线 {{ trail.length > 2 ? trail.length + ' 点' : '还没连成线' }} · 上证季线在下面</text>
        <text class="ag-c-fold-x">{{ showTrail ? '▾ 收起' : '▸ 展开' }}</text>
      </view>

      <view v-if="showTrail && trail.length > 2" class="ag-trail ag-trail--c">
        <Sparkline :values="trail" :height="56" />
      </view>
    </template>

    <template v-else>
      <view class="ag-asset-hd">
        <view class="ag-hd-l">
          <view class="ag-ph" :style="phStyle">
            <template v-if="phMode === 'canvas'">
              <!-- #ifdef MP-WEIXIN -->
              <canvas :id="pid" type="2d" class="ag-ph-cv" :style="phCvStyle" />
              <!-- #endif -->
              <!-- #ifdef H5 -->
              <canvas :id="pid" :canvas-id="pid" class="ag-ph-cv" :style="phCvStyle" />
              <!-- #endif -->
            </template>
            <view v-else class="ag-ph-fb" />
          </view>
          <text class="ag-kick">账户资产</text>
        </view>
        <view class="ag-chips">
          <text class="ag-chip">{{ view.age }} 岁</text>
          <text
            v-if="view.streak.tone !== 'none'"
            :class="['ag-chip', view.streak.tone === 'win' ? 'ag-chip--win' : 'ag-chip--lose']"
          >{{ view.streak.text }}</text>
        </view>
      </view>

      <view class="ag-asset-num">
        <text class="ag-cur">¥</text>
        <text class="ag-big">{{ assetText }}</text>
      </view>

      <view class="ag-asset-sub">
        <text :class="['ag-delta', deltaTone]">{{ deltaLabel }} {{ deltaText }}</text>
        <text class="ag-asset-where">{{ view.yearText }} · Q{{ view.quarter }}{{ view.whereText ? ' · ' + view.whereText : '' }}</text>
      </view>

      <view v-if="trail.length > 2" class="ag-trail">
        <Sparkline :values="trail" :height="96" />
      </view>

      <view class="ag-brow" v-for="b in view.bars" :key="b.key">
        <text class="ag-brow-l">{{ b.label }}</text>
        <view class="ag-brow-track">
          <view :class="['ag-brow-fill', 'ag-fill--' + b.tone]" :style="{ width: b.value + '%' }" />
          <!-- 分界位置来自 tokens.css 的 --bar-thr-1/2（与 core barTone 同源） -->
          <view class="ag-thr ag-thr--1" />
          <view class="ag-thr ag-thr--2" />
        </view>
        <text class="ag-brow-v">{{ b.value }}</text>
      </view>
    </template>
  </view>
</template>

<style scoped>
.ag-hd-l {
  display: flex;
  align-items: center;
}
.ag-ph {
  position: relative;
  margin-right: 14rpx;
  border-radius: 8rpx;
  overflow: hidden;
  background: radial-gradient(120% 100% at 50% 100%, rgba(246, 207, 114, 0.1), rgba(246, 207, 114, 0) 70%);
  border: 1px solid var(--line-0);
}
.ag-ph-cv {
  display: block;
}
.ag-ph-fb {
  position: absolute;
  left: 30%;
  top: 14%;
  width: 40%;
  height: 26%;
  border-radius: 50%;
  background: var(--ink-2);
  opacity: 0.5;
}

/* ---- 紧凑版：头像与数字并排（40px），人生条 22px，走势折一行 ---- */
.ag-c-row {
  display: flex;
  align-items: center;
  height: 42px;
}
.ag-c-row .ag-ph {
  margin-right: 8px;
  flex: 0 0 auto;
}
.ag-c-main {
  flex: 1;
  min-width: 0;
}
.ag-c-num {
  display: flex;
  align-items: baseline;
  height: 30px;
  overflow: hidden;
}
.ag-cur--c {
  font-size: 14px;
  margin-right: 2px;
}
.ag-big--c {
  font-size: 28px;
  line-height: 30px;
  letter-spacing: -0.5px;
}
.ag-chip--c {
  flex: 0 0 auto;
  margin-left: 6px;
  margin-right: 0;
  padding: 0 5px;
  font-size: 9px;
  line-height: 13px;
  border-radius: 4px;
}
.ag-asset-sub--c {
  margin-top: 0;
  height: 12px;
  overflow: hidden;
}
.ag-delta--c {
  font-size: 10px;
  line-height: 12px;
}
.ag-asset-where--c {
  font-size: 9px;
  line-height: 12px;
}
.ag-c-bars {
  margin-top: 2px;
}
.ag-brow--c {
  margin-top: 1px;
  height: 10px;
}
.ag-brow-l--c {
  width: 26px;
  font-size: 8px;
  line-height: 10px;
}
.ag-brow-track--c {
  height: 5px;
  margin: 0 6px;
}
.ag-brow-v--c {
  width: 22px;
  font-size: 8px;
  line-height: 10px;
}
.ag-c-fold {
  display: flex;
  align-items: baseline;
  height: 16px;
  margin-top: 2px;
}
.ag-c-fold-k {
  flex: 0 0 auto;
  font-size: 9px;
  line-height: 16px;
  color: var(--ink-2);
  letter-spacing: 1px;
}
.ag-c-fold-v {
  flex: 1;
  min-width: 0;
  margin-left: 6px;
  font-size: 9px;
  line-height: 16px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-c-fold-x {
  flex: 0 0 auto;
  margin-left: 6px;
  font-size: 9px;
  line-height: 16px;
  color: var(--ink-1);
}
.ag-trail--c {
  margin: 2px 0 0;
}
</style>
