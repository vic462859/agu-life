<script setup lang="ts">
/**
 * 贵贱标尺：core 已经算好 index/offsetPct/word/text，这里只画。
 * bare 版给交易页的双条用（与 GoalTrack 并排、共享左右留白）；完整版仍给别处留退路。
 */
import { computed } from 'vue'
import type { TradeView } from '../../core'

const props = defineProps<{ zone: TradeView['zone']; bare?: boolean }>()

/** 小字位放不下整句「现在比最近两年的均价贵 12%」，只去掉那截废话，数字与方向原样保留。 */
const shortText = computed(function () {
  return String(props.zone.text).replace('现在比最近两年的均价', '比均价')
})
</script>

<template>
  <view :class="bare ? 'ag-duo-col' : 'ag-panel'">
    <view :class="bare ? 'ag-duo-hd' : 'ag-panel-hd'">
      <text v-if="!bare" class="ag-kick">贵贱</text>
      <text :class="['ag-zone-word', 'ag-tone-' + zone.tone, bare ? 'ag-zone-word--c' : '']">{{ zone.word }}</text>
      <text v-if="bare" class="ag-zone-idx">{{ zone.index + 1 }}/5</text>
    </view>

    <view :class="['ag-zone', bare ? 'ag-zone--c' : '']">
      <view class="ag-zone-track" />
      <view class="ag-zone-dot" :style="{ left: zone.offsetPct }" />
    </view>

    <view :class="bare ? 'ag-duo-ft' : 'ag-zone-meta'">
      <text :class="bare ? 'ag-zone-short' : 'ag-dim'" :style="bare ? '' : 'font-size: 24rpx'">{{ bare ? shortText : zone.text }}</text>
    </view>
  </view>
</template>

<style scoped>
.ag-duo-col {
  flex: 1;
  min-width: 0;
}
.ag-duo-col + .ag-duo-col {
  margin-left: 10px;
}
.ag-duo-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  height: 12px;
}
.ag-zone-word--c {
  font-size: 10px;
  line-height: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-zone-idx {
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 12px;
  color: var(--ink-2);
  margin-left: 4px;
}
.ag-zone--c {
  height: 14px;
  margin-top: 2px;
  margin-left: 4px;
  margin-right: 4px;
}
.ag-zone--c .ag-zone-track {
  height: 6px;
}
.ag-zone--c .ag-zone-dot {
  width: 8px;
  height: 12px;
  margin-left: -4px;
  box-shadow: none;
}
.ag-duo-ft {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  height: 11px;
  overflow: hidden;
}
.ag-zone-short {
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 11px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
