<script setup lang="ts">
/**
 * 挑战码：一串可以抄给别人的字。
 * 组件只负责显示与"复制到剪贴板"，编解码全在 core/challenge.ts，页面不重复实现。
 */
import { computed, onUnmounted, ref } from 'vue'

const props = defineProps<{
  /** 挑战码本体（AGU-XXXXXXX）。 */
  code: string
  /** 附在下面的一句分享文案，例如「同一局：指数 27.7× / 你 3.2×」。 */
  share?: string
  /** 小标题，默认「挑战码」。 */
  label?: string
  /** 顶栏用：只显示码本身，不占一整块。 */
  compact?: boolean
  /** 本局带的天赋名。挑战码本身不含天赋信息，所以必须单独标出来。 */
  talent?: string
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const title = computed(function () { return props.label || '挑战码' })
const hasTalent = computed(function () { return !!props.talent })
const hint = computed(function () { return copied.value ? '已复制' : '复制' })

function stopTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function mark(): void {
  copied.value = true
  stopTimer()
  timer = setTimeout(function () { copied.value = false }, 1600)
}

/** 剪贴板：优先 uni（小程序/H5 都有），退回 navigator，都没有就只提示，不抛。 */
function copy(): void {
  const text = props.code
  if (!text) return
  try {
    const uni = (globalThis as unknown as { uni?: { setClipboardData?: (o: { data: string }) => void } }).uni
    if (uni && typeof uni.setClipboardData === 'function') {
      uni.setClipboardData({ data: text })
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(function () { /* 用户没给权限就算了 */ })
    }
  } catch (e) {
    /* 复制失败不该影响看这一局 */
  }
  mark()
}

onUnmounted(stopTimer)
</script>

<template>
  <view v-if="compact" id="challenge-chip" class="ag-cc-chip" @tap="copy">
    <text class="ag-cc-chip-v">{{ code }}</text>
    <text class="ag-cc-chip-k">{{ copied ? '已复制' : '复制' }}</text>
  </view>
  <text v-if="compact && hasTalent" id="challenge-chip-talent" class="ag-cc-chip-t">带天赋：{{ talent }}</text>
  <!-- 注意：这里的 v-else 必须挂在 `compact` 上（不是挂在「compact 且带天赋」上）。
       挂错了的话 compact 且不带天赋时会同时画出 chip 与整张卡 —— 交易页那条挑战码细行
       一直高 100px 而不自知，就是因为整张卡被画在 chip 旁边。 -->
  <view v-else-if="!compact" id="challenge-card" class="ag-cc">
    <view class="ag-cc-hd">
      <text class="ag-kick">{{ title }}</text>
      <text class="ag-cc-hint">{{ hint }}</text>
    </view>
    <view id="challenge-copy" class="ag-cc-body" @tap="copy">
      <text class="ag-cc-code">{{ code }}</text>
    </view>
    <text v-if="share" class="ag-cc-share">{{ share }}</text>
    <text v-if="hasTalent" id="challenge-talent" class="ag-cc-talent">带天赋：{{ talent }}</text>
    <text v-if="hasTalent" class="ag-cc-fair">挑战码里没有天赋信息：同一个码、不同天赋的两局不能直接比。</text>
  </view>
</template>

<style scoped>
.ag-cc-chip {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  padding: 4rpx 12rpx;
  border: 1px solid var(--line-0);
  border-radius: 8rpx;
  background: rgba(255, 255, 255, 0.03);
  white-space: nowrap;
}
.ag-cc-chip-k {
  font-size: 20rpx;
  letter-spacing: 1rpx;
  color: var(--ink-2);
  margin-left: 12rpx;
}
.ag-cc-chip-v {
  font-family: var(--font-mono);
  font-size: 22rpx;
  letter-spacing: 2rpx;
  color: var(--gold-0);
  white-space: nowrap;
}
.ag-cc {
  border: 1px solid var(--line-0);
  border-radius: var(--r-lg);
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(246, 207, 114, 0.09), rgba(246, 207, 114, 0) 60%),
    var(--bg-1);
  padding: 18rpx 20rpx 20rpx;
}
.ag-cc-hd {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12rpx;
}
.ag-cc-hint {
  font-size: 20rpx;
  letter-spacing: 1rpx;
  color: var(--ink-2);
}
.ag-cc-body {
  border: 1px dashed rgba(246, 207, 114, 0.42);
  border-radius: 8rpx;
  padding: 12rpx 14rpx;
}
.ag-cc-code {
  font-family: var(--font-mono);
  font-size: 34rpx;
  font-weight: 700;
  letter-spacing: 6rpx;
  color: var(--gold-0);
}
.ag-cc-share {
  display: block;
  margin-top: 12rpx;
  font-family: var(--font-mono);
  font-size: 22rpx;
  letter-spacing: 1rpx;
  color: var(--teal-0);
}
.ag-cc-talent {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  letter-spacing: 1rpx;
  color: var(--gold-0);
}
.ag-cc-fair {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  line-height: 1.5;
  color: var(--ink-2);
}
.ag-cc-chip-t {
  font-size: 20rpx;
  letter-spacing: 1rpx;
  color: var(--gold-0);
  margin-left: 12rpx;
  white-space: nowrap;
}
</style>
