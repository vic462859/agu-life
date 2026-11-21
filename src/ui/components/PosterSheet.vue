<script setup lang="ts">
/**
 * 战报弹层：进弹层即把 1080×1440 的海报画到 canvas 上（H5 可存 PNG，小程序存相册）。
 * 画布拿不到时给可读提示 + 文字版战报，不白屏。
 */
import { computed, getCurrentInstance, nextTick, onMounted, ref } from 'vue'
import { fmt, type EndView } from '../../core'
import { POSTER_H, POSTER_W, buildPosterData, drawPoster, type PosterData } from '../share/poster'
import { acquirePoster } from '../share/posterCanvas'
import { savePoster } from '../share/saveImage'
import { eraOf } from '../composables/useEra'

const props = defineProps<{ end: EndView; asset: number; endYear: number }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const inst = getCurrentInstance()
const CID = 'm2-poster'
const status = ref('正在生成…')
const ready = ref(false)
const data = ref<PosterData | null>(null)

const aspect = computed(function () { return POSTER_W + ' / ' + POSTER_H })

onMounted(async function () {
  await nextTick()
  data.value = buildPosterData(props.end, '¥' + fmt(props.asset), eraOf(props.endYear).label)
  const ctx = await acquirePoster(CID, inst)
  if (!ctx) {
    status.value = '这个环境画不出海报（画布不可用），下面是文字版战报。'
    return
  }
  try {
    drawPoster(ctx, data.value)
    ready.value = true
    status.value = ''
  } catch (e) {
    status.value = '绘制失败：' + (e && (e as Error).message ? (e as Error).message : '未知原因')
  }
})

async function save(): Promise<void> {
  status.value = '正在保存…'
  const r = await savePoster(CID)
  status.value = r.msg
}
</script>

<template>
  <view class="ag-mask">
    <view class="ag-sheet" @tap.stop>
      <view class="ag-sheet-hd">
        <text class="ag-kick">战报 · {{ POSTER_W }}×{{ POSTER_H }}</text>
        <text class="ag-stamp">分享</text>
      </view>
      <view class="ag-sheet-body">
        <view class="ag-poster-wrap">
          <canvas
            :id="CID"
            :canvas-id="CID"
            type="2d"
            class="ag-poster-cv"
            :style="'width: 540rpx; height: 720rpx; aspect-ratio: ' + aspect"
          />
        </view>

        <view v-if="status" class="ag-poster-tip">{{ status }}</view>

        <view v-if="data && !ready" class="ag-poster-tip">
          {{ data.title }} · {{ data.startText }} → {{ data.finalText }} · {{ data.multiple }} · 最多回撤 {{ data.maxDD }} · 最长连盈 {{ data.bestStreak }}
        </view>

        <view class="ag-end-actions">
          <button class="ag-btn ag-btn--primary" :disabled="!ready" @tap="save">保存图片</button>
          <button id="poster-close" class="ag-btn" @tap="emit('close')">关闭</button>
        </view>
      </view>
    </view>
  </view>
</template>
