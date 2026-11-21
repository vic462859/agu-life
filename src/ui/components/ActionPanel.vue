<script setup lang="ts">
/**
 * 行动区：剩余行动点可视格子 + 六扇门 + 打探（第七扇）。
 *
 * V4 一屏决策：2×4 网格，每格 38px（标题 12px + 一句 9px），整块 106px。
 * 行动点不再是单独的标题行 —— 三个小格挪到同一行的右侧，跟「剩 2 次」并排。
 */
import { AP_PER_YEAR, type GroupView } from '../../core'

defineProps<{
  groups: GroupView[]
  apLeft: number
  apText: string
  canProbe: boolean
}>()
const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'probe'): void
}>()
</script>

<template>
  <view class="ag-panel ag-panel--tight">
    <view class="ag-act-hd">
      <text class="ag-kick">还能动</text>
      <text class="ag-act-n">{{ apText }}</text>
      <view class="ag-ap ag-ap--c">
        <view
          v-for="i in AP_PER_YEAR"
          :key="i"
          :class="['ag-ap-cell', 'ag-ap-cell--c', i <= apLeft ? 'ag-ap-cell--on' : '']"
        />
      </view>
    </view>

    <view class="ag-doors ag-doors--c">
      <view
        v-for="g in groups"
        :id="'group-' + g.id"
        :key="g.id"
        :class="['ag-door', 'ag-door--c', g.disabled ? 'ag-door--off' : '']"
        @tap="emit('open', g.id)"
      >
        <text class="ag-door-t ag-door-t--c">{{ g.t }}</text>
        <text class="ag-door-d ag-door-d--c">{{ g.d }}</text>
      </view>

      <view
        id="group-probe"
        :class="['ag-door', 'ag-door--c', 'ag-door--probe', !canProbe ? 'ag-door--off' : '']"
        @tap="emit('probe')"
      >
        <text class="ag-door-t ag-door-t--c">打探</text>
        <text class="ag-door-d ag-door-d--c">看清甲和乙哪条是真</text>
        <text class="ag-door-tag ag-door-tag--c">{{ canProbe ? '1 次' : '已用' }}</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
/* 标题行 14 + 2 行 × 38 + 内边距 12 + 缝 2 = 106px。 */
.ag-act-hd {
  display: flex;
  align-items: center;
  height: 14px;
}
.ag-act-n {
  margin-left: 6px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 14px;
  color: var(--ink-2);
}
.ag-ap--c {
  margin-left: auto;
}
.ag-ap-cell--c {
  width: 10px;
  height: 10px;
  margin-left: 3px;
  border-radius: 2px;
}
.ag-doors--c {
  display: flex;
  flex-wrap: wrap;
  margin-top: 2px;
}
.ag-door--c {
  position: relative;
  width: calc(25% - 2px);
  height: 38px;
  margin: 0 2px 2px 0;
  padding: 4px 4px;
  box-sizing: border-box;
  border: 1px solid var(--line-0);
  border-radius: 6px;
  background-color: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}
.ag-door--c:nth-child(4n) {
  margin-right: 0;
}
.ag-door-t--c {
  display: block;
  font-size: 10px;
  line-height: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-door-d--c {
  display: block;
  margin-top: 1px;
  font-size: 9px;
  line-height: 12px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 打探占两格：第七扇门本来就比别的门重。 */
.ag-door--probe {
  width: calc(50% - 2px);
  display: flex;
  align-items: center;
  border-style: dashed;
}
.ag-door--probe .ag-door-t--c,
.ag-door--probe .ag-door-d--c {
  margin-right: 4px;
}
.ag-door-tag--c {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 8px;
  padding: 0 3px;
}
</style>
