<script setup lang="ts">
/** 事件卡 / 年底人生卡 / 晚年卡：pending 非空时只能在这里 choose。 */
import type { PendingEventView } from '../../core'

defineProps<{
  pending: PendingEventView
  /** 年代主题 class（按标题里的年份取），取不到就空串。 */
  era?: string
}>()
const emit = defineEmits<{ (e: 'choose', i: number): void }>()
</script>

<template>
  <view class="ag-mask">
    <view :class="['ag-sheet', 'ag-era-body', era || '']">
      <view v-if="era" class="ag-era-tex" />
      <view class="ag-sheet-hd">
        <text class="ag-kick">{{ pending.title }}</text>
        <text class="ag-stamp">{{ pending.type === 'event' ? '事件' : pending.type === 'year' ? '年底' : '晚年' }}</text>
      </view>
      <scroll-view class="ag-modal-scroll" scroll-y style="max-height: 76vh">
        <view :class="['ag-h2', era ? 'ag-era-head' : '']">{{ pending.heading }}</view>
        <view v-if="era" class="ag-era-rule" />
        <view v-if="pending.who" class="ag-p" style="font-family: var(--font-mono); font-size: 24rpx">{{ pending.who }}</view>
        <view class="ag-p" style="color: var(--ink-0); font-size: 27rpx">{{ pending.body }}</view>
        <view class="ag-rule" />
        <view
          v-for="(o, i) in pending.options"
          :id="'opt-' + i"
          :key="o.k"
          class="ag-opt"
          @tap="emit('choose', i)"
        >
          <text class="ag-opt-idx">{{ i + 1 }}</text>
          <view style="flex: 1">
            <view class="ag-opt-t">{{ o.k }}</view>
            <view class="ag-opt-d">
              {{ o.d }}<text v-if="o.locked" class="ag-lock">　（{{ o.lockText }}）</text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>
