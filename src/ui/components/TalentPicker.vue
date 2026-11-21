<script setup lang="ts">
/**
 * 天赋三选一（其实是六选一 + 不带）：跨局攒的记忆点在这里花。
 * 已解锁的能直接带；没解锁的显示锁和价钱，点一下解锁（点数不够就点不动）。
 * 组件不算规则：解锁、可不可带都走 core/meta 的纯函数。
 */
import type { TalentRow } from '../../core/meta'

const props = defineProps<{
  rows: TalentRow[]
  /** 手上还剩多少记忆点。 */
  points: number
  /** 这一局已选的出身名字，用来提示「带着天赋这一局不可比」。 */
  orgName: string
}>()
const emit = defineEmits<{
  (e: 'pick', id: string | null): void
  (e: 'unlock', id: string): void
}>()

function lockedShort(t: TalentRow): string {
  return t.affordable ? '解锁（' + t.price + ' 点）' : '还差 ' + (t.price - props.points) + ' 点'
}

function unlock(t: TalentRow): void {
  if (t.affordable) emit('unlock', t.id)
}
</script>

<template>
  <view class="ag-screen">
    <view class="ag-stamp">记忆点 {{ points }} · 跨局累加</view>
    <view class="ag-h1">带一样东西上路</view>
    <view class="ag-p">
      这些东西不是这一局攒的，是上一局留下的。每局最多带一样，也可以什么都不带——
      不带的局才是干净的一局。
    </view>
    <view class="ag-rule" />

    <view v-for="t in rows" :id="'talent-' + t.id" :key="t.id" :class="['ag-pick', t.unlocked ? '' : 'ag-pick--lock']">
      <view class="ag-pick-t">
        {{ t.name }}
        <text v-if="t.unlocked" class="ag-talent-tag">已解锁</text>
        <text v-else class="ag-talent-lock">锁 · {{ t.price }} 点</text>
      </view>
      <view class="ag-pick-d">{{ t.desc }}</view>
      <view class="ag-talent-row">
        <text v-if="t.unlocked" :id="'talent-pick-' + t.id" class="ag-talent-go" @tap.stop="emit('pick', t.id)">带这一样 →</text>
        <text
          v-else
          :id="'talent-unlock-' + t.id"
          :class="['ag-talent-go', t.affordable ? '' : 'ag-talent-go--off']"
          @tap.stop="unlock(t)"
        >{{ lockedShort(t) }}</text>
        <text class="ag-talent-price">价 {{ t.price }} 点</text>
      </view>
    </view>

    <button id="talent-none" class="ag-btn ag-btn--ghost" style="margin-top: 18rpx" @tap="emit('pick', null)">
      不带天赋 · {{ orgName }}这一局纯挑战
    </button>

    <view class="ag-hintline" style="margin-top: 8rpx">
      <text class="ag-hintline-t">
        带天赋的局，挑战码卡与结局页都会标「带天赋：XX」。挑战码里没有天赋信息——
        同一个码、不同天赋的两局不能直接比大小。
      </text>
    </view>
  </view>
</template>

<style scoped>
.ag-pick--lock {
  opacity: 0.62;
}
.ag-talent-tag {
  font-size: 20rpx;
  letter-spacing: 1rpx;
  color: var(--teal-0);
  margin-left: 12rpx;
}
.ag-talent-lock {
  font-size: 20rpx;
  letter-spacing: 1rpx;
  color: var(--ink-2);
  margin-left: 12rpx;
}
.ag-talent-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 14rpx;
}
.ag-talent-go {
  font-size: 24rpx;
  color: var(--gold-0);
  border-bottom: 1px dashed rgba(246, 207, 114, 0.42);
  padding-bottom: 2rpx;
}
.ag-talent-go--off {
  color: var(--ink-2);
  border-bottom: 1px dashed var(--line-0);
}
.ag-talent-price {
  font-family: var(--font-mono);
  font-size: 20rpx;
  color: var(--ink-2);
}
</style>
