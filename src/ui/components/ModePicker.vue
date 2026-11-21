<script setup lang="ts">
/** 模式三选一。 */
import type { Mode } from '../../core'

const emit = defineEmits<{
  (e: 'pick', m: Mode): void
  (e: 'back'): void
}>()

const modes: { id: Mode; name: string; desc: string }[] = [
  { id: 'real', name: '史实模式', desc: '年份、点位、那年最流行的一句话，全都给你看。第一次玩，用这个。' },
  { id: 'fog', name: '迷雾模式', desc: '年份被抹掉，只剩「第几年」。点位不报数，票价也不给看。' },
  { id: 'draw', name: '抽签模式 · 最狠', desc: '三十六年全部真实，但顺序被打乱。看你能不能不信自己。' },
]
</script>

<template>
  <view class="ag-screen">
    <view class="ag-stamp">选一个模式</view>
    <view class="ag-h1">你想怎么认这三十六年</view>
    <view class="ag-p">行情都是真的，144 个季度，一分没改。要改的只是你知不知道自己在哪一年。</view>
    <view class="ag-rule" />

    <view v-for="m in modes" :id="'mode-' + m.id" :key="m.id" class="ag-pick" @tap="emit('pick', m.id)">
      <view class="ag-pick-t">{{ m.name }}</view>
      <view class="ag-pick-d">{{ m.desc }}</view>
    </view>

    <button id="mode-back" class="ag-btn ag-btn--ghost" @tap="emit('back')">返回</button>
  </view>
</template>
