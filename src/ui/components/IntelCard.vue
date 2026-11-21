<script setup lang="ts">
/**
 * 消息卡：甲/乙两行。真/假用「前缀符号 + 左边框样式 + 文字标签」区分，不只靠红绿。
 *
 * V4 一屏决策：默认折成一行 —— 「今年的两条消息 · 甲/乙 未核 ▸」，
 * 未打探且盘感 ≥45 时那一行直接显示盘感提示（core 已经把它写进 hint 的第一句）。
 * 点开才是正文 + 打探按钮；正文一字没删，只是要先点一下。
 */
import { computed } from 'vue'
import type { IntelView } from '../../core'

const props = defineProps<{ intel: IntelView; open?: boolean }>()
const emit = defineEmits<{ (e: 'probe'): void; (e: 'toggle'): void }>()

function glyph(t: string): string {
  return t === 't' ? '◆' : t === 'f' ? '◇' : '·'
}
function tag(t: string): string {
  return t === 't' ? '真' : t === 'f' ? '假的' : '未核'
}
function rowClass(t: string): string {
  return t === 't' ? 'ag-intel-row--t' : t === 'f' ? 'ag-intel-row--f' : 'ag-intel-row--n'
}

/** 折起来那一行右侧的状态：未核 / 已核 · 真在甲。 */
const stateText = computed(function () {
  const rows = props.intel.rows
  if (!props.intel.probed) return '甲/乙 未核'
  let real = ''
  for (let i = 0; i < rows.length; i++) if (rows[i].truth === 't') real = rows[i].name
  return real ? '已核 · 真在' + real : '已核'
})

/** 盘感提示（core 在 sense ≥45 且未打探时把整句放在 hint 开头）。 */
const senseLine = computed(function () {
  if (props.intel.probed) return ''
  return String(props.intel.hint).indexOf('盘感') === 0 ? props.intel.hint : ''
})
</script>

<template>
  <view v-if="intel.visible" class="ag-panel ag-panel--tight">
    <view id="intel-fold" class="ag-ifold" @tap="emit('toggle')">
      <text class="ag-ifold-k">今年的两条消息</text>
      <text class="ag-ifold-s">{{ stateText }}</text>
      <text v-if="!open && senseLine" class="ag-ifold-hint">{{ senseLine }}</text>
      <text class="ag-ifold-x">{{ open ? '▾' : '▸' }}</text>
    </view>

    <template v-if="open">
      <view v-for="r in intel.rows" :key="r.name" :class="['ag-intel-row', 'ag-intel-row--c', rowClass(r.truth)]">
        <text class="ag-intel-glyph">{{ glyph(r.truth) }}</text>
        <view class="ag-intel-body">
          <view>
            <text class="ag-intel-name">{{ r.name }}</text>
            <text class="ag-intel-tag" :class="'ag-intel-tag--' + r.truth">{{ tag(r.truth) }}</text>
          </view>
          <view class="ag-intel-text">{{ r.text }}</view>
        </view>
      </view>

      <view class="ag-intel-ft">
        <text class="ag-intel-hint">{{ intel.hint }}</text>
        <view v-if="intel.canProbe" id="probe" class="ag-chip ag-chip--solid ag-intel-probe" @tap="emit('probe')">打探 · 1 次</view>
        <text v-else class="ag-intel-done">已摸清来路</text>
      </view>
    </template>
  </view>
</template>

<style scoped>
/* 折起来 30px（一行 18 + 内边距 12）；展开才长出来。 */
.ag-ifold {
  display: flex;
  align-items: baseline;
  height: 18px;
}
.ag-ifold-k {
  font-size: 10px;
  line-height: 18px;
  color: var(--ink-1);
  letter-spacing: 1px;
  flex: 0 0 auto;
}
.ag-ifold-s {
  margin-left: 6px;
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 18px;
  color: var(--ink-2);
}
.ag-ifold-hint {
  margin-left: 6px;
  flex: 1;
  min-width: 0;
  font-size: 9px;
  line-height: 18px;
  color: var(--gold-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-ifold-x {
  flex: 0 0 auto;
  margin-left: auto;
  padding-left: 6px;
  font-size: 10px;
  line-height: 18px;
  color: var(--ink-2);
}
.ag-intel-row--c {
  padding: 6px 8px;
  margin-top: 6px;
  margin-bottom: 0;
}
.ag-intel-ft {
  display: flex;
  align-items: flex-start;
  margin-top: 6px;
}
.ag-intel-hint {
  flex: 1;
  min-width: 0;
  font-size: 9px;
  line-height: 13px;
  color: var(--ink-1);
}
.ag-intel-probe {
  flex: 0 0 auto;
  margin-left: 6px;
  font-size: 9px;
  padding: 1px 6px;
}
.ag-intel-done {
  flex: 0 0 auto;
  margin-left: 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-2);
}
</style>
