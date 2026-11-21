<script setup lang="ts">
/** 仓位四段 + 杠杆/止损两个明确的开合状态（滑钮位置 / 文字 / 边框样式三重区分）。 */
import { computed } from 'vue'
import type { PositionView } from '../../core'

const props = defineProps<{
  positions: PositionView[]
  lev: boolean
  stop: boolean
  /** 一屏决策版：段高 26px、两个开合并成一行、风险提示挪到标题行右侧（整块 76px）。 */
  compact?: boolean
}>()
const emit = defineEmits<{
  (e: 'setPos', v: number): void
  (e: 'toggle', k: 'lev' | 'stop'): void
}>()

const RISK: Record<string, string> = {
  '0': '空仓：这一季的涨跌与你无关，也什么都学不到。',
  '0.25': '1/4 仓：小仓试水，回撤有限，赚也有限。',
  '0.5': '半仓：一半的波动你自己扛。',
  '1': '满仓：波动全额承担，没有缓冲。',
}

const cur = computed(function () {
  for (let i = 0; i < props.positions.length; i++) if (props.positions[i].on) return props.positions[i]
  return null
})
const riskText = computed(function () {
  if (!cur.value) return ''
  return RISK[String(cur.value.value)] || ''
})
</script>

<template>
  <view :class="['ag-panel', compact ? 'ag-panel--tight' : '']">
    <view :class="compact ? 'ag-pos-hd' : 'ag-panel-hd'">
      <text class="ag-kick">仓位</text>
      <text :class="compact ? 'ag-pos-cur' : 'ag-panel-hd-r'">{{ cur ? cur.label : '未定' }}</text>
      <text v-if="compact" class="ag-pos-risk">{{ riskText }}</text>
    </view>

    <view :class="['ag-seg', compact ? 'ag-seg--c' : '']">
      <view
        v-for="(p, pi) in positions"
        :id="'pos-' + pi"
        :key="p.value"
        :class="['ag-seg-i', compact ? 'ag-seg-i--c' : '', p.on ? 'ag-seg-i--on' : '']"
        @tap="emit('setPos', p.value)"
      >{{ p.label }}</view>
    </view>

    <view v-if="!compact" class="ag-hintline">
      <text class="ag-hintline-t">{{ riskText }}</text>
    </view>

    <view :class="['ag-flags', compact ? 'ag-flags--c' : '']">
      <view :class="['ag-flag', compact ? 'ag-flag--c' : '', lev ? 'ag-flag--on' : 'ag-flag--off']" @tap="emit('toggle', 'lev')">
        <view class="ag-flag-t">
          <text :class="['ag-flag-name', compact ? 'ag-flag-name--c' : '']">杠杆</text>
          <text class="ag-flag-v">×1.5</text>
        </view>
        <view :class="compact ? 'ag-sw-wrap--c' : ''" :style="compact ? '' : 'display: flex; flex-direction: column; align-items: flex-end'">
          <view :class="['ag-sw', compact ? 'ag-sw--c' : '']"><view class="ag-sw-knob" /></view>
          <text :class="['ag-sw-txt', compact ? 'ag-sw-txt--c' : '']">{{ lev ? '已开' : '已关' }}</text>
        </view>
      </view>

      <view :class="['ag-flag', compact ? 'ag-flag--c' : '', stop ? 'ag-flag--on' : 'ag-flag--off']" @tap="emit('toggle', 'stop')">
        <view class="ag-flag-t">
          <text :class="['ag-flag-name', compact ? 'ag-flag-name--c' : '']">止损</text>
          <text class="ag-flag-v">−32%</text>
        </view>
        <view :class="compact ? 'ag-sw-wrap--c' : ''" :style="compact ? '' : 'display: flex; flex-direction: column; align-items: flex-end'">
          <view :class="['ag-sw', compact ? 'ag-sw--c' : '']"><view class="ag-sw-knob" /></view>
          <text :class="['ag-sw-txt', compact ? 'ag-sw-txt--c' : '']">{{ stop ? '已开' : '已关' }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
/* 紧凑版：标题 14 + 段 26 + 开合 24 + 内边距 12 = 76px。 */
.ag-pos-hd {
  display: flex;
  align-items: baseline;
  height: 14px;
  overflow: hidden;
}
.ag-pos-cur {
  margin-left: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 14px;
  color: var(--gold-0);
  font-weight: 700;
  flex: 0 0 auto;
}
.ag-pos-risk {
  margin-left: 8px;
  flex: 1;
  min-width: 0;
  font-size: 9px;
  line-height: 14px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
}
.ag-seg--c {
  padding: 2px;
  border-radius: 8px;
}
.ag-seg-i--c {
  padding: 0;
  line-height: 22px;
  height: 22px;
  font-size: 11px;
  font-weight: 600;
}
.ag-flags--c {
  margin-top: 4px;
}
.ag-flag--c {
  padding: 2px 8px;
  height: 24px;
  box-sizing: border-box;
}
.ag-flag--c:first-child {
  margin-right: 6px;
}
.ag-flag-name--c {
  font-size: 10px;
  line-height: 12px;
}
.ag-sw-wrap--c {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.ag-sw--c {
  width: 26px;
  height: 14px;
}
.ag-sw--c .ag-sw-knob {
  width: 8px;
  height: 8px;
  top: 2px;
  left: 2px;
}
.ag-flag--on .ag-sw--c .ag-sw-knob {
  left: 14px;
}
.ag-sw-txt--c {
  margin-top: 0;
  margin-left: 4px;
  font-size: 9px;
  line-height: 12px;
}
</style>
