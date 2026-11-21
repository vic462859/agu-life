<script setup lang="ts">
/** 晚年页：交易期结束后的二十三年。版式更静：没有板块、没有仓位，只有身家与回忆。 */
import { computed } from 'vue'
import { fmt, type LateView } from '../../core'
import { useCountUp } from '../composables/useCountUp'
import GoalTrack from './GoalTrack.vue'
import LogStream, { type LogRow } from './LogStream.vue'

const props = defineProps<{
  late: LateView
  asset: number
  canStep: boolean
  items: LogRow[]
  fast?: boolean
}>()
const emit = defineEmits<{ (e: 'step'): void }>()

const shown = useCountUp(function () { return props.asset }, function () {
  return props.fast ? 0 : 460
})
const assetText = computed(function () { return fmt(shown.value) })
</script>

<template>
  <view class="ag-screen">
    <view class="ag-panel">
      <view class="ag-asset-hd">
        <text class="ag-kick">晚年 · {{ late.yearText }}</text>
        <view class="ag-chips">
          <text class="ag-chip">{{ late.age }} 岁</text>
          <text v-if="late.companion" class="ag-chip">{{ late.companion }}</text>
        </view>
      </view>
      <view class="ag-asset-num">
        <text class="ag-cur">¥</text>
        <text class="ag-big">{{ assetText }}</text>
      </view>
      <view class="ag-asset-sub">
        <text class="ag-dim" style="font-size: 24rpx">没有季线了。只剩日子。</text>
        <text class="ag-asset-where">{{ late.companion }}</text>
      </view>
    </view>

    <GoalTrack :goal="late.goal" />
    <LogStream :items="items" />

    <button id="go-late" class="ag-btn ag-btn--primary" style="margin-top: 20rpx" :disabled="!canStep" @tap="emit('step')">
      往下过
    </button>
  </view>
</template>
