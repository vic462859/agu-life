<script setup lang="ts">
/**
 * 日志流：按 tone 上色、按年份分组、最新在上，来了新条目自动滚回顶部。
 *
 * V4 一屏决策：交易页给 foldable + open 时，默认只留最新一条（单行省略），点开才是完整列表
 * （展开后允许滚动 —— 那是玩家主动要看的）。LatePanel 不传这两个 prop，版式与以前一样。
 */
import { nextTick, ref, watch } from 'vue'
import { TONE_CLASS, type Tone } from '../../core'

export interface LogRow {
  text: string
  tone: Tone
  year: string
}

const props = defineProps<{ items: LogRow[]; foldable?: boolean; open?: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()

const scrollTop = ref(0)
watch(
  function () { return props.items.length },
  function () {
    scrollTop.value = 1
    nextTick(function () {
      setTimeout(function () { scrollTop.value = 0 }, 0)
    })
  },
)

function toneClass(t: Tone): string {
  return 'ag-l--' + TONE_CLASS[t]
}
</script>

<template>
  <!-- 交易页那一条（foldable）跟其它紧凑面板同样 6px 内边距：rpx 的内边距会随窗口宽度放大，
       430 宽时白白多出 3px，紧凑版不该有这种不受控的位移。晚年页那条保持原样。 -->
  <view :class="['ag-panel', 'ag-panel--flat', foldable ? 'ag-panel--tight' : '']">
    <view v-if="!foldable" class="ag-panel-hd">
      <text class="ag-kick">流水</text>
      <text class="ag-panel-hd-r">{{ items.length }} 条 · 最新在上</text>
    </view>

    <template v-else>
      <view id="log-fold" class="ag-lfold" @tap="emit('toggle')">
        <text class="ag-lfold-k">流水</text>
        <text class="ag-lfold-n">{{ items.length }} 条</text>
        <text v-if="!open" class="ag-lfold-one">
          <text v-if="items.length" class="ag-lfold-y">{{ items[0].year }}</text>
          <text v-if="items.length" class="ag-lfold-t">{{ items[0].text }}</text>
          <text v-else class="ag-lfold-t">还没有发生任何事。</text>
        </text>
        <text class="ag-lfold-x">{{ open ? '▾ 收起' : '▸ 展开' }}</text>
      </view>

      <scroll-view v-if="open" class="ag-log ag-log--c" scroll-y :scroll-top="scrollTop">
        <block v-for="(l, i) in items" :key="i">
          <view v-if="i === 0 || items[i - 1].year !== l.year" class="ag-log-year">
            <text class="ag-log-year-t">{{ l.year }}</text>
            <view class="ag-log-year-l" />
          </view>
          <view :class="['ag-log-i', toneClass(l.tone)]">{{ l.text }}</view>
        </block>
      </scroll-view>
    </template>

    <scroll-view v-if="!foldable" class="ag-log" scroll-y :scroll-top="scrollTop">
      <view v-if="!items.length" class="ag-log-empty">还没有发生任何事。</view>
      <block v-for="(l, i) in items" :key="i">
        <view v-if="i === 0 || items[i - 1].year !== l.year" class="ag-log-year">
          <text class="ag-log-year-t">{{ l.year }}</text>
          <view class="ag-log-year-l" />
        </view>
        <view :class="['ag-log-i', toneClass(l.tone)]">{{ l.text }}</view>
      </block>
    </scroll-view>
  </view>
</template>

<style scoped>
.ag-log {
  height: 520rpx;
}
/* 展开是玩家自己要看的：给个固定高度、允许滚动，不再往页面长度上加。 */
.ag-log--c {
  height: 220px;
}

/* 折起来 18px：一条流水单行省略，年份在左，正文吃满剩下的宽度。 */
.ag-lfold {
  display: flex;
  align-items: baseline;
  height: 18px;
  overflow: hidden;
}
.ag-lfold-k {
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 18px;
  color: var(--ink-2);
  letter-spacing: 1px;
}
.ag-lfold-n {
  flex: 0 0 auto;
  margin-left: 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 18px;
  color: var(--ink-2);
}
.ag-lfold-one {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  margin-left: 6px;
  overflow: hidden;
  white-space: nowrap;
}
.ag-lfold-y {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 18px;
  color: var(--ink-2);
  margin-right: 5px;
}
.ag-lfold-t {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  line-height: 18px;
  color: var(--ink-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-lfold-x {
  flex: 0 0 auto;
  margin-left: 6px;
  font-size: 9px;
  line-height: 18px;
  color: var(--ink-2);
}
</style>
