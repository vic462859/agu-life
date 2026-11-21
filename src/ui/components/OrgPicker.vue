<script setup lang="ts">
/** 出身三选一：1984 的年代质感（邮票式标签 + 等宽数字）。 */
import { fmt, type Org } from '../../core'

defineProps<{ orgs: Org[]; hasSave: boolean }>()
const emit = defineEmits<{
  (e: 'pick', i: number): void
}>()
</script>

<template>
  <view class="ag-screen">
    <view class="ag-stamp">1984 · 你 18 岁</view>
    <view class="ag-h1">你从哪儿来</view>
    <view class="ag-p">这一年，街上开始有人穿西装。你不知道股票是什么，只知道厂里的工资涨得慢。</view>
    <view class="ag-rule" />

    <view v-for="(o, i) in orgs" :id="'org-' + i" :key="o.k" class="ag-pick" @tap="emit('pick', i)">
      <view class="ag-pick-t">{{ o.k }}</view>
      <view class="ag-pick-d">{{ o.d }}</view>
      <view class="ag-pick-meta">
        <text>本金 {{ fmt(o.start) }}</text>
        <text>盘感 {{ o.sense }}</text>
        <text>人脉 {{ o.net }}</text>
        <text>声望 {{ o.rep }}</text>
        <text>身体 {{ o.health }}</text>
      </view>
    </view>

    <view v-if="hasSave" class="ag-hintline" style="margin-top: 8rpx">
      <text class="ag-hintline-t">检测到一份存档。点开时会先问你：接着上一局，还是重新开始。</text>
    </view>
  </view>
</template>
