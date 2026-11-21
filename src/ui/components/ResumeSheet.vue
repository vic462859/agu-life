<script setup lang="ts">
/** 续玩弹窗：检测到存档时给两个明确选项，不让人误点。 */
import { fmt, type GameState } from '../../core'

defineProps<{ state: GameState | null; savedAt: string }>()
const emit = defineEmits<{
  (e: 'resume'): void
  (e: 'fresh'): void
}>()
</script>

<template>
  <view class="ag-mask">
    <view class="ag-sheet">
      <view class="ag-sheet-hd">
        <text class="ag-kick">检测到上一局</text>
        <text class="ag-stamp">{{ savedAt }}</text>
      </view>
      <view class="ag-sheet-body">
        <view class="ag-h2">接着走，还是从头来</view>
        <view v-if="state" class="ag-p" style="font-family: var(--font-mono); font-size: 24rpx">
          {{ state.phase === 'trade' ? '交易期' : state.phase === 'late' ? '晚年' : '已结束' }} ·
          账户 ¥{{ fmt(state.s.asset) }} ·
          {{ state.mode === 'real' ? '史实' : state.mode === 'fog' ? '迷雾' : '抽签' }}模式
        </view>
        <view class="ag-rule" />

        <view id="resume" class="ag-opt" @tap="emit('resume')">
          <text class="ag-opt-idx">1</text>
          <view style="flex: 1">
            <view class="ag-opt-t">继续上一局</view>
            <view class="ag-opt-d">从存档的季度接着往下走，日志重新开始记。</view>
          </view>
        </view>
        <view id="resume-new" class="ag-opt" @tap="emit('fresh')">
          <text class="ag-opt-idx">2</text>
          <view style="flex: 1">
            <view class="ag-opt-t">重新开始</view>
            <view class="ag-opt-d">清掉存档，回到 1984 年重新选出身。</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>
