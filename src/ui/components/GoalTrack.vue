<script setup lang="ts">
/**
 * 上岸进度条：对数刻度 0.5×—50×，1× 与 10× 两根刻度线 + 当前位置点。
 *
 * 两种版式：
 * - 面板版（默认）：LatePanel 用，带标题、刻度行、说明行。
 * - 裸版（bare）：交易页把「上岸」与「贵贱」并成一行的左半条 —— 只留标签 + 条 + 一行小字，
 *   高度压在 37px 以内，一屏决策才有位置给板块卡。
 */
import { computed } from 'vue'
import { progOf, type GoalView } from '../../core'
import { useCountUp } from '../composables/useCountUp'
import { parseLabelNum, motionMs, withNum } from '../composables/motion'

const props = defineProps<{ goal: GoalView; bare?: boolean }>()

/* 三个数字一起滚：条宽（百分比）、×N 读数、以及「离上岸还差 N×」里的那个 N。
   同一个 tick 里各起一条补间 ⇒ 同时开始、同时收敛（不是一条条排队）。
   时长走 motionMs('count')：reduce 命中或跳过动画时返回 0，直接落到终值。 */
function ms(): number {
  return motionMs('count')
}

const shownRatio = useCountUp(function () { return props.goal.ratio }, ms)
/** 文案里的数字（10/m 那位小数）。抽不出数字的文案（传说/已上岸/还没回本）原样显示。 */
const shownNum = useCountUp(function () {
  const n = parseLabelNum(props.goal.label)
  return n === null ? 0 : n
}, ms)

const fillPct = computed(function () { return (progOf(shownRatio.value) * 100).toFixed(2) + '%' })
const tick1 = computed(function () { return (progOf(1) * 100).toFixed(2) + '%' })
const tick10 = computed(function () { return (progOf(10) * 100).toFixed(2) + '%' })
const ratioText = computed(function () {
  const m = shownRatio.value
  return '×' + (m >= 10 ? m.toFixed(1) : m.toFixed(2))
})
/** 「离上岸还差 8.3×」→ 数字补间中，阈值分支与文案都还是 core 那一份。 */
const labelText = computed(function () { return withNum(props.goal.label, shownNum.value) })
</script>

<template>
  <view :class="bare ? 'ag-duo-col' : 'ag-panel'">
    <view :class="bare ? 'ag-duo-hd' : 'ag-panel-hd'">
      <template v-if="bare">
        <text :class="['ag-duo-lb', 'ag-tone-' + goal.tone]">{{ labelText }}</text>
        <text class="ag-duo-r">{{ ratioText }}</text>
      </template>
      <template v-else>
        <text class="ag-kick">上岸进度</text>
        <view class="ag-panel-hd-r">
          <text>{{ ratioText }}</text>
          <text style="margin: 0 10rpx; opacity: 0.5">/</text>
          <text>0.5–50×</text>
        </view>
      </template>
    </view>

    <view :class="['ag-goal-wrap', bare ? 'ag-goal-wrap--c' : '']">
      <view class="ag-goal-track">
        <view class="ag-goal-fill" :style="{ width: fillPct }" />
      </view>
      <view class="ag-goal-tick ag-goal-tick--key" :style="{ left: tick1 }" />
      <view class="ag-goal-tick ag-goal-tick--key" :style="{ left: tick10 }" />
      <view class="ag-goal-dot" :style="{ left: fillPct }" />
    </view>

    <template v-if="!bare">
      <view class="ag-goal-scale">
        <text style="left: 0">0.5×</text>
        <text :style="{ left: tick1 }">1×</text>
        <text :style="{ left: tick10 }">10×</text>
        <text style="left: 100%">50×</text>
      </view>

      <view class="ag-goal-line">
        <text :class="['ag-goal-label', 'ag-tone-' + goal.tone]">{{ labelText }}</text>
        <text class="ag-goal-ratio">{{ goal.fromText }}</text>
      </view>
    </template>
    <view v-else class="ag-duo-ft">
      <text class="ag-duo-ft-t">刻度 0.5 / 1 / 10 / 50×</text>
      <text class="ag-duo-ft-v">{{ goal.fromText }}</text>
    </view>
  </view>
</template>

<style scoped>
/* 裸版：整个双条那一行只占 37px（标签 12 + 条 14 + 小字 11）。 */
.ag-duo-col {
  flex: 1;
  min-width: 0;
}
.ag-duo-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  height: 12px;
}
.ag-duo-lb {
  font-size: 10px;
  line-height: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-duo-r {
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 12px;
  color: var(--ink-2);
  margin-left: 4px;
}
.ag-goal-wrap--c {
  height: 14px;
  margin: 2px 4px 0;
}
.ag-goal-wrap--c .ag-goal-track {
  top: 4px;
  height: 6px;
}
.ag-goal-wrap--c .ag-goal-tick {
  top: 1px;
  height: 12px;
}
.ag-goal-wrap--c .ag-goal-dot {
  top: 2px;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border-width: 1px;
  box-shadow: none;
}
.ag-duo-ft {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  height: 11px;
  overflow: hidden;
}
.ag-duo-ft-t,
.ag-duo-ft-v {
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 11px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-duo-ft-v {
  margin-left: 4px;
  flex: 0 0 auto;
}
</style>
