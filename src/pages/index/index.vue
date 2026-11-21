<script setup lang="ts">
/**
 * 交易主界面（M1-B 视觉层 + M2-A 仪式感/分享/摩擦消除）。
 * 所有读数来自 useGame() 的 view/late/end/pending；页面不自己算任何游戏规则，
 * 只做三件事：数字补间、日志按年份分组、把"推进前后"的差值摆出来给人看。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ORG, SUBS, buildQuarters, deserialize, SAVE_KEY, type GameState, type LogItem, type Mode, type SectorId } from '../../core'
import { useGame } from '../../composables/useGame'
import { createStorage } from '../../platform/storage'
import { decodeChallenge, encodeChallenge } from '../../core/challenge'
import { armTalent, talentName } from '../../core/data/talents'
import { award, carryTalent, META_KEY, parseMeta, serializeMeta, talentRows, unlock, type MetaState } from '../../core/meta'
import OrgPicker from '../../ui/components/OrgPicker.vue'
import ChallengeCode from '../../ui/components/ChallengeCode.vue'
import { FOLD_KEY, foldSig, parseFold, serializeFold, type FoldKey } from '../../ui/components/foldState'
import ModePicker from '../../ui/components/ModePicker.vue'
import TalentPicker from '../../ui/components/TalentPicker.vue'
import AssetHead from '../../ui/components/AssetHead.vue'
import GoalTrack from '../../ui/components/GoalTrack.vue'
import ZoneTrack from '../../ui/components/ZoneTrack.vue'
import SectorCards from '../../ui/components/SectorCards.vue'
import PositionPanel from '../../ui/components/PositionPanel.vue'
import ActionPanel from '../../ui/components/ActionPanel.vue'
import IntelCard from '../../ui/components/IntelCard.vue'
import LogStream, { type LogRow } from '../../ui/components/LogStream.vue'
import EventModal from '../../ui/components/EventModal.vue'
import EndCard from '../../ui/components/EndCard.vue'
import LatePanel from '../../ui/components/LatePanel.vue'
import ResumeSheet from '../../ui/components/ResumeSheet.vue'
import PosterSheet from '../../ui/components/PosterSheet.vue'
import LineChart from '../../ui/components/charts/LineChart.vue'
import { eraFromTitle } from '../../ui/composables/useEra'
import { useHotkeys } from '../../ui/composables/useHotkeys'
import { useFeel } from '../../ui/composables/useFeel'

const FAST_KEY = 'agu_fast'
const POS = [0, 0.25, 0.5, 1]

const game = useGame()
const state = game.state
const logs = game.logs
const view = game.view
const late = game.late
const end = game.end
const pending = game.pending

const storage = createStorage()
const orgIndex = ref<number | null>(null)

/* --- 手感（V2a）：声音的接线 + 弹层出场 ---
   按下态的"样子"在 CSS（:active + base.css 的统一规则），这里只管两件 JS 才做得了的事：
   ① 声音：第一次手势解锁、每次按下可点元素一声轻点击、结算涨/跌两种方向音、事件弹出提示；
   ② 出场：弹层先播 140ms 反向动画，再撤 v-if。 */
const feel = useFeel(game.sfx)

/* --- 折叠记忆：消息 / 日志 / 走势 三处（存 agu_fold_v1，不进存档，不影响挑战码复现） ---
   钥匙是「当前局」的指纹（模式 + seed）：同一局刷新还是你上次的样子，换一局自动回到默认折叠。 */
const fold = ref<Record<FoldKey, boolean>>(parseFold(storage.get(FOLD_KEY), ''))
const foldKeyNow = computed(function () { return foldSig(state.value) })
watch(foldKeyNow, function (sig) {
  fold.value = parseFold(storage.get(FOLD_KEY), sig)
})
function toggleFold(k: FoldKey): void {
  const next: Record<FoldKey, boolean> = { intel: fold.value.intel, log: fold.value.log, chart: fold.value.chart }
  next[k] = !next[k]
  fold.value = next
  storage.set(FOLD_KEY, serializeFold(foldKeyNow.value, next))
}
onMounted(function () {
  fold.value = parseFold(storage.get(FOLD_KEY), foldKeyNow.value)
})

/* --- 跨局记忆：记忆点 / 天赋解锁 / 本局带的天赋（独立存档 agu_meta_v1） --- */
const meta = ref<MetaState>(parseMeta(storage.get(META_KEY)))
const talentRowsView = computed(function () { return talentRows(meta.value) })
/** 本局带的天赋名（没带是空串）。挑战码卡与结局页都靠它标「带天赋：XX」。 */
const talentLabel = computed(function () { return talentName(meta.value.currentTalent) })
const orgName = computed(function () { return orgIndex.value === null ? '' : ORG[orgIndex.value].k })
/** 开局三选一这一步：选完出身、选模式之前。 */
const talentsOpen = ref(false)
const pickedTalent = ref<string | null>(null)
/** 这一局结算到的记忆点（结局页显示）。 */
const earnedPoints = ref(0)

function persistMeta(): void {
  storage.set(META_KEY, serializeMeta(meta.value))
}
function onTalentPick(id: string | null): void {
  pickedTalent.value = id
  meta.value = carryTalent(meta.value, id)
  persistMeta()
  talentsOpen.value = false
  if (challengeStart.value) startWith(challengeStart.value.mode)
}
function onTalentUnlock(id: string): void {
  const r = unlock(meta.value, id)
  if (!r.ok) return
  meta.value = r.meta
  persistMeta()
}

/** 结局一出来就结算记忆点。同一指纹只加一次，所以重复进结局页（含刷新续玩）不会刷点。 */
watch(
  end,
  function (v) {
    if (!v || !state.value) return
    const r = award(meta.value, state.value.s, state.value.seed)
    if (r.duplicate) return
    meta.value = r.meta
    earnedPoints.value = r.earned
    persistMeta()
  },
  { immediate: true },
)
const activeGroup = ref<string | null>(null)
const soundLabel = ref(game.soundOn() ? '音效 开' : '音效 关')
const fast = ref(storage.get(FAST_KEY) === '1')

const orgs = ORG
const subs = computed(function () { return activeGroup.value ? SUBS[activeGroup.value] || [] : [] })
const rep = computed(function () { return state.value ? state.value.s.rep : 0 })

/* --- 已存档轻提示（不打扰：只在右上角闪一下） --- */
const saveHint = ref(0)
let hintTimer: ReturnType<typeof setTimeout> | null = null
watch(state, function (v) {
  if (!v) return
  saveHint.value = Date.now()
  if (hintTimer !== null) clearTimeout(hintTimer)
  hintTimer = setTimeout(function () { saveHint.value = 0 }, 1600)
})
onUnmounted(function () {
  if (hintTimer !== null) clearTimeout(hintTimer)
})

/* --- 续玩：进来先读存档摘要，给一个人话弹窗 --- */
const resumeAsk = ref(false)
const savedState = ref<GameState | null>(null)
onMounted(function () {
  if (!game.hasSave.value) return
  const raw = storage.get(SAVE_KEY)
  savedState.value = deserialize(raw)
  resumeAsk.value = true
})
function doResume(): void {
  feel.leave('.ag-mask', function () {
    resumeAsk.value = false
    resumeGame()
  })
}
function doFresh(): void {
  feel.leave('.ag-mask', function () {
    resumeAsk.value = false
    game.clearSave()
    savedState.value = null
    orgIndex.value = null
    talentsOpen.value = false
    pickedTalent.value = null
    earnedPoints.value = 0
  })
}
/** 战报弹层的关闭：走同一个出场口子（Esc / 点遮罩 / 关闭按钮三条路都到这里） */
function closePoster(): void {
  feel.leave('.ag-mask', function () { posterOpen.value = false })
}

/* --- 战报弹层 --- */
const posterOpen = ref(false)

/* --- 音效：事件/年底/晚年卡一出现就给一声（不刺耳的那一声，见 platform/audio.ts 的 intel） ---
   连开两张卡时 pending 不会经过 null，所以签名的口径是「类型 + 标题 + 正文首句」，而不是 pending 本身。 */
watch(
  function () {
    const p = pending.value
    return p ? p.type + '|' + p.title + '|' + p.heading : ''
  },
  function (sig) {
    if (sig) feel.pop()
  },
)

/* --- 本次推进的 delta：只记「推进前的资产」，不做任何规则计算 --- */
const deltaBase = ref<number | null>(null)
const deltaLabel = ref('本季 Δ')
const delta = computed(function () {
  if (deltaBase.value === null || !state.value) return null
  return state.value.s.asset - deltaBase.value
})
const deltaPct = computed(function () {
  if (deltaBase.value === null || !deltaBase.value || !state.value) return null
  return ((state.value.s.asset - deltaBase.value) / deltaBase.value) * 100
})

/* --- 日志按年份分组：内核给了 year 就用它，没给就按文案/到达年份回退 --- */
const seen = new WeakSet<object>()
const yearOf = new WeakMap<object, string>()
let stampOverride: string | null = null

watch(logs, function (nl: LogItem[]) {
  const cur = view.value ? view.value.yearText : late.value ? late.value.yearText : '—'
  const y = stampOverride || cur
  for (let i = 0; i < nl.length; i++) {
    const it = nl[i]
    if (!seen.has(it)) {
      seen.add(it)
      yearOf.set(it, y)
    }
  }
  stampOverride = null
})

const logRows = computed<LogRow[]>(function () {
  return logs.value.map(function (it) {
    const tagged = (it as unknown as { year?: number }).year
    if (typeof tagged === 'number' && isFinite(tagged)) {
      return { text: it.text, tone: it.tone, year: String(tagged) }
    }
    const m = /^(\d{4})/.exec(it.text)
    return { text: it.text, tone: it.tone, year: m ? m[1] : yearOf.get(it) || '—' }
  })
})

/* --- 走势图数据：只取已经走完的季度（迷雾模式不给点位） --- */
const series = computed(function () {
  const st = state.value
  if (!st || st.mode === 'fog' || st.phase !== 'trade') return [] as { t: string; v: number }[]
  const Q = buildQuarters(st.map)
  const stop = Math.min(st.s.qi, Q.length)
  const from = Math.max(0, stop - 12)
  const out: { t: string; v: number }[] = []
  for (let i = from; i < stop; i++) out.push({ t: Q[i].y + ' Q' + Q[i].q, v: Math.round(Q[i].p0) })
  return out
})
const chartMarks = computed(function () {
  return series.value.length ? [{ idx: series.value.length - 1 }] : []
})

/** 上一局最后走到的年份：结局卡的年代主题用它。 */
const endYear = computed(function () {
  const st = state.value
  if (!st) return 2026
  const Q = buildQuarters(st.map)
  const i = Math.min(st.s.qi, Q.length) - 1
  return i >= 0 ? Q[i].y : 2026
})

/** 年度事件卡的年代主题：从标题里的年份取（迷雾模式取不到就不挂）。 */
const eventEra = computed(function () {
  if (!pending.value) return ''
  const e = eraFromTitle(pending.value.title)
  return e ? e.cls : ''
})

/** 账户曲线：每次推进把 view.asset 追加进来，只用于画迷你走势，不参与任何判定。 */
const trail = ref<number[]>([])
watch(
  function () { return state.value ? state.value.s.asset : null },
  function (v) {
    if (v === null) {
      trail.value = []
      return
    }
    const next = trail.value.concat([v])
    trail.value = next.length > 28 ? next.slice(next.length - 28) : next
  },
)

const showDock = computed(function () { return !!view.value && !pending.value && !end.value && !late.value })

/* --- 挑战码：只解析、只显示，规则全在 core/challenge.ts --- */
const MODE_TEXT: Record<Mode, string> = { real: '史实', fog: '迷雾', draw: '抽签' }
const challengeOpen = ref(false)
const challengeText = ref('')
const challengeMsg = ref<{ ok: boolean; text: string } | null>(null)
/** 已认出的挑战码：出身一选就按它开局（seed 与模式都锁死）。 */
const challengeStart = ref<{ seed: number; mode: Mode } | null>(null)

/** 本局的挑战码：有了局面就从 seed + mode 反推，和开局时用的是同一套编码。 */
const currentCode = computed(function () {
  const st = state.value
  return st ? encodeChallenge(st.seed, st.mode) : ''
})

function modeText(m: Mode): string {
  return MODE_TEXT[m] || '史实'
}
function openChallenge(): void {
  challengeOpen.value = true
  challengeMsg.value = null
}
function closeChallenge(): void {
  challengeOpen.value = false
  challengeMsg.value = null
  challengeStart.value = null
  challengeText.value = ''
}
function onCodeInput(e: Event): void {
  // H5 是原生 input（target.value），小程序是 detail.value，两种都认
  const detail = (e as unknown as { detail?: { value?: string } }).detail
  const target = (e as unknown as { target?: { value?: string } }).target
  challengeText.value = (detail && detail.value) || (target && target.value) || ''
}
/** 认码：永远不抛；认不出就给可读提示并把这一局退回随机 seed。 */
function applyCode(): void {
  const r = decodeChallenge(challengeText.value)
  if (r.ok) {
    challengeStart.value = { seed: r.seed, mode: r.mode }
    challengeMsg.value = { ok: true, text: '认出来了：' + modeText(r.mode) + ' · seed ' + r.seed + ' · ' + r.code + '。挑一个出身就开局。' }
    return
  }
  challengeStart.value = { seed: r.fallback.seed, mode: r.fallback.mode }
  challengeMsg.value = { ok: false, text: r.message + ' 已退回随机 seed ' + r.fallback.seed + '，挑一个出身照样开局。' }
}

function pickOrg(i: number): void {
  orgIndex.value = i
  // 先过一次「带不带天赋」，带完再决定要不要过模式选择（挑战码锁了模式）
  talentsOpen.value = true
}
function startWith(mode: Mode): void {
  if (orgIndex.value === null) return
  const seed = challengeStart.value ? challengeStart.value.seed : undefined
  stampOverride = '开局'
  // 天赋只在这一步交接给内核：arm → begin 读 → 立刻清，不留脏状态
  armTalent(pickedTalent.value)
  try {
    game.begin(orgIndex.value, mode, seed)
  } finally {
    armTalent(null)
  }
  talentsOpen.value = false
  pickedTalent.value = null
  earnedPoints.value = 0
  orgIndex.value = null
  activeGroup.value = null
  deltaBase.value = null
  challengeOpen.value = false
  challengeMsg.value = null
  challengeStart.value = null
}
function openGroup(id: string): void {
  if (pending.value) return
  if (game.openGroup(id)) activeGroup.value = id
}
/** 所有弹层都从这一个口子关：先播出场（140ms 反向），播完才撤 v-if。
    动画期间重复点击被 feel.leave 吞掉 —— 连点两次不会把两次 choose 排进同一次。 */
function closedGroup(): void {
  feel.leave('.ag-mask', function () { activeGroup.value = null })
}
function runSub(i: number): void {
  const g = activeGroup.value
  if (!g || pending.value) return
  feel.leave('.ag-mask', function () {
    activeGroup.value = null
    game.act(g, i)
  })
}
function pickSector(id: SectorId): void {
  if (pending.value) return
  game.pickSector(id)
}
/* 结算方向音：推进前记下资产，推进后按差值给一声（涨 gain / 跌 fall / 平盘不响）。
   快进一次跨四季度时只响最后一声 —— 否则连响四下，等于没有反馈。 */
let silentSteps = 0
function stepAssetNow(): number | null {
  return state.value ? state.value.s.asset : null
}
function nextStep(): void {
  if (!view.value || !view.value.canStep || pending.value) return
  deltaLabel.value = '本季 Δ'
  const base = stepAssetNow()
  deltaBase.value = base
  stampOverride = view.value.yearText
  game.stepOnce()
  if (silentSteps === 0) feel.settle(base === null ? null : (stepAssetNow() || 0) - base)
}
function nextYear(): void {
  if (!view.value || !view.value.canStep || pending.value) return
  deltaLabel.value = '本年 Δ'
  const base = stepAssetNow()
  deltaBase.value = base
  stampOverride = view.value.yearText
  game.stepWholeYear()
  feel.settle(base === null ? null : (stepAssetNow() || 0) - base)
}
/** 快进到年末：从当前季度一路走到下一年 Q1（遇到事件立即停，交给事件卡）。 */
function fastForwardYear(): void {
  if (!view.value || !view.value.canStep || pending.value) return
  const startQ = view.value.quarter
  const cap = startQ >= 2 && startQ <= 4 ? 5 - startQ : 4
  const base = stepAssetNow()
  let steps = 0
  silentSteps++
  try {
    while (steps < cap) {
      if (!state.value || pending.value || !view.value || !view.value.canStep) break
      if (steps > 0 && view.value.quarter === 1) break
      deltaLabel.value = '本年 Δ'
      nextStep()
      steps++
      if (pending.value) break
    }
  } finally {
    silentSteps--
  }
  feel.settle(base === null ? null : (stepAssetNow() || 0) - base)
}
function lateStep(): void {
  if (!late.value || pending.value) return
  const base = stepAssetNow()
  deltaBase.value = base
  stampOverride = late.value.yearText
  game.stepOnce()
  feel.settle(base === null ? null : (stepAssetNow() || 0) - base)
}
function choose(i: number): void {
  feel.leave('.ag-mask', function () { game.choose(i) })
}
function probe(): void {
  if (pending.value) return
  game.probe()
}
function toggleSound(): void {
  const on = game.toggleSound()
  soundLabel.value = on ? '音效 开' : '音效 关'
}
function toggleFast(): void {
  fast.value = !fast.value
  storage.set(FAST_KEY, fast.value ? '1' : '0')
}
function backToOrg(): void {
  // 结局页没有遮罩时 leave 会当场执行，这条路径不用分支
  feel.leave('.ag-mask', backToOrgNow)
}
function backToOrgNow(): void {
  game.restart()
  orgIndex.value = null
  activeGroup.value = null
  deltaBase.value = null
  posterOpen.value = false
  talentsOpen.value = false
  pickedTalent.value = null
  earnedPoints.value = 0
}
function resumeGame(): void {
  stampOverride = '续玩'
  game.resume()
  orgIndex.value = null
}

/* H5 键盘：Space / 1-4 / L / S / Esc（小程序端整段被条件编译剥掉） */
useHotkeys(function () {
  return {
    quarter: function () {
      if (showDock.value) nextStep()
    },
    position: function (i: number) {
      if (!showDock.value || i < 0 || i > 3) return
      game.setPos(POS[i])
    },
    lev: function () {
      if (showDock.value) game.toggleFlag('lev')
    },
    stopLoss: function () {
      if (showDock.value) game.toggleFlag('stop')
    },
    esc: function () {
      if (posterOpen.value) closePoster()
      else if (activeGroup.value) closedGroup()
    },
  }
})
</script>

<template>
  <view class="ag-root">
    <view class="ag-bg" />
    <view class="ag-bg-vignette" />

    <view :class="['ag-shell', showDock ? 'ag-shell--c' : 'ag-shell--nodock']">
      <view :class="['ag-topbar', showDock ? 'ag-topbar--c' : '']">
        <view class="ag-brand">
          <view class="ag-brand-dot" />
          <text class="ag-brand-t">A股人生</text>
          <text class="ag-brand-sub">1991—2026</text>
        </view>
        <view v-if="saveHint" :key="saveHint" class="ag-saved">已存档</view>
        <view v-if="state" class="ag-tools">
          <view id="sound" class="ag-tool" @tap="toggleSound">{{ soundLabel }}</view>
          <view id="restart" class="ag-tool" @tap="backToOrg">重开</view>
        </view>
      </view>

      <!-- 本局挑战码：顶栏塞不下，单独一条细行 -->
      <view v-if="view && currentCode" :class="['ag-cc-bar', showDock ? 'ag-cc-bar--c' : '']">
        <text class="ag-cc-bar-k">本局挑战码</text>
        <ChallengeCode compact :code="currentCode" :talent="talentLabel" />
        <text v-if="!showDock" class="ag-cc-bar-tip">点一下复制</text>
      </view>

      <!-- 出身 -->
      <OrgPicker
        v-if="!state && orgIndex === null"
        :orgs="orgs"
        :has-save="game.hasSave.value"
        @pick="pickOrg"
      />

      <!-- 挑战码：有码的人不用重新抽一局 -->
      <view v-if="!state && orgIndex === null" class="ag-cc-entry">
        <view v-if="!challengeOpen" id="challenge-open" class="ag-cc-entry-row" @tap="openChallenge">
          <text class="ag-cc-entry-k">有挑战码？</text>
          <text class="ag-cc-entry-v">用同一局开局 →</text>
        </view>
        <view v-else class="ag-cc-entry-box">
          <view class="ag-cc-entry-hd">
            <text class="ag-kick">输入挑战码</text>
            <text id="challenge-close" class="ag-cc-entry-x" @tap="closeChallenge">收起</text>
          </view>
          <input
            id="challenge-input"
            class="ag-cc-input"
            :value="challengeText"
            placeholder="AGU-XXXXXXX"
            placeholder-class="ag-cc-input-ph"
            @input="onCodeInput"
          />
          <button id="challenge-apply" class="ag-btn ag-btn--primary" @tap="applyCode">认这个码</button>
          <text v-if="challengeMsg" :class="['ag-cc-msg', challengeMsg.ok ? 'ag-cc-msg--ok' : 'ag-cc-msg--bad']">{{ challengeMsg.text }}</text>
          <text v-if="challengeStart" class="ag-cc-msg ag-cc-msg--ok">这一局：{{ modeText(challengeStart.mode) }} · seed {{ challengeStart.seed }} · {{ encodeChallenge(challengeStart.seed, challengeStart.mode) }}</text>
        </view>
      </view>

      <!-- 天赋：出身选完、模式之前，六选一或者不带 -->
      <TalentPicker
        v-else-if="!state && talentsOpen"
        :rows="talentRowsView"
        :points="meta.points"
        :org-name="orgName"
        @pick="onTalentPick"
        @unlock="onTalentUnlock"
      />

      <!-- 模式 -->
      <ModePicker v-else-if="orgIndex !== null" @pick="startWith" @back="orgIndex = null" />

      <!-- 结局 -->
      <EndCard
        v-else-if="end"
        :end="end"
        :asset="state ? state.s.asset : 0"
        :end-year="endYear"
        :fast="fast"
        :code="currentCode"
        :talent="talentLabel"
        :points="earnedPoints"
        @restart="backToOrg"
        @poster="posterOpen = true"
      />

      <!-- 晚年 -->
      <LatePanel
        v-else-if="late"
        :late="late"
        :asset="state ? state.s.asset : 0"
        :can-step="!pending"
        :items="logRows"
        :fast="fast"
        @step="lateStep"
      />

      <!-- 交易：V4 一屏决策（390×844 不滚动就能挑板块 / 定仓位 / 过一季） -->
      <view v-else-if="view" class="ag-trade">
        <AssetHead
          :view="view"
          :delta="delta"
          :delta-pct="deltaPct"
          :delta-label="deltaLabel"
          :trail="trail"
          :fast="fast"
          compact
          :show-trail="fold.chart"
          @toggle-trail="toggleFold('chart')"
        />

        <view v-if="view.alarms.length" class="ag-alarm-line">
          <text v-for="a in view.alarms" :key="a" class="ag-alarm-line-t">{{ a }}</text>
        </view>

        <!-- 目标条 + 贵贱条：一行双条，各 37px，共享左右留白 -->
        <view class="ag-panel ag-panel--tight">
          <view class="ag-duo">
            <GoalTrack bare :goal="view.goal" />
            <ZoneTrack bare :zone="view.zone" />
          </view>
        </view>

        <SectorCards
          :sectors="view.sectors"
          :year-row="view.yearRow"
          :map="state ? state.map : null"
          :kty="state ? state.s.kty : null"
          :upto-qi="state ? state.s.qi : 0"
          @pick="pickSector"
        />

        <PositionPanel
          :positions="view.positions"
          :lev="view.lev"
          :stop="view.stop"
          compact
          @set-pos="game.setPos"
          @toggle="game.toggleFlag"
        />

        <IntelCard
          :intel="view.intel"
          :open="fold.intel"
          @toggle="toggleFold('intel')"
          @probe="probe"
        />

        <ActionPanel
          :groups="view.groups"
          :ap-left="view.apLeft"
          :ap-text="view.apText"
          :can-probe="view.intel.canProbe"
          @open="openGroup"
          @probe="probe"
        />

        <!-- 走势（上证季线 + 那年的注脚）：默认折叠，展开才占地方 -->
        <view v-if="fold.chart" class="ag-panel ag-panel--tight">
          <view class="ag-chart-hd">
            <text class="ag-kick">上证季线 · 过去 {{ series.length }} 季</text>
            <text class="ag-chart-hd-r">终点 {{ view.whereText }}</text>
          </view>
          <LineChart v-if="series.length > 1" :points="series" :height="200" :marks="chartMarks" :fill="true" />
          <text v-else class="ag-chart-none">迷雾模式：席位不给点位，季线不画。</text>
          <text v-if="view.yearLine" class="ag-chart-quote">{{ view.yearLine }}</text>
        </view>

        <LogStream
          :items="logRows"
          foldable
          :open="fold.log"
          @toggle="toggleFold('log')"
        />
      </view>
    </view>

    <!-- 底部主行动（拇指可达） -->
    <view v-if="showDock && view" class="ag-dock">
      <view class="ag-dock-in">
        <button id="go-quarter" class="ag-btn ag-btn--primary ag-dock-main" :disabled="!view.canStep" @tap="nextStep">
          过这一季
          <text class="ag-btn__cap">Q{{ view.quarter }}</text>
        </button>
        <button id="go-year" class="ag-btn ag-dock-year" :disabled="!view.canStep" @tap="nextYear">
          过一年
          <text class="ag-btn__cap">×4</text>
        </button>
      </view>
      <view class="ag-dock-sub">
        <view id="go-quarter-end" class="ag-mini" :class="view.canStep ? '' : 'ag-mini--off'" @tap="fastForwardYear">
          快进到年末
        </view>
        <view id="fast-toggle" class="ag-mini" :class="fast ? 'ag-mini--on' : ''" @tap="toggleFast">
          跳过动画 {{ fast ? '开' : '关' }}
        </view>
        <!-- #ifdef H5 -->
        <view id="hotkey-hint" class="ag-mini ag-mini--hint">Space 过季 · 1-4 仓位 · L/S 开关</view>
        <!-- #endif -->
      </view>
    </view>

    <!-- 行动子项 -->
    <view v-if="activeGroup" class="ag-mask" @tap="closedGroup">
      <view class="ag-sheet" @tap.stop>
        <view class="ag-sheet-hd">
          <text class="ag-kick">今年还能动 {{ view ? view.apLeft : 0 }} 次</text>
          <text class="ag-stamp">{{ activeGroup }}</text>
        </view>
        <view class="ag-sheet-body">
          <view v-for="(o, i) in subs" :id="'sub-' + i" :key="o.t" class="ag-opt" @tap="runSub(i)">
            <text class="ag-opt-idx">{{ i + 1 }}</text>
            <view style="flex: 1">
              <view class="ag-opt-t">{{ o.t }}</view>
              <view class="ag-opt-d">
                {{ o.d }}<text v-if="o.need && rep < o.need" class="ag-lock">　（需声望 {{ o.need }}，你现在 {{ rep }}）</text>
              </view>
            </view>
          </view>
          <button id="group-close" class="ag-btn ag-btn--ghost" style="margin-top: 18rpx" @tap="closedGroup">算了</button>
        </view>
      </view>
    </view>

    <!-- 事件卡 / 年底卡 / 晚年卡（年度事件带年代质感） -->
    <EventModal v-if="pending" :pending="pending" :era="eventEra" @choose="choose" />

    <!-- 续玩 -->
    <ResumeSheet v-if="resumeAsk" :state="savedState" saved-at="本地存档" @resume="doResume" @fresh="doFresh" />

    <!-- 战报 -->
    <PosterSheet
      v-if="posterOpen && end"
      :end="end"
      :asset="state ? state.s.asset : 0"
      :end-year="endYear"
      @close="closePoster"
    />
  </view>
</template>

<style>
.ag-shell.ag-shell--nodock {
  padding-bottom: 64rpx;
}
.ag-alarms {
  display: flex;
  flex-wrap: wrap;
}
.ag-alarm {
  font-size: 24rpx;
  color: var(--red-0);
  border: 1px dashed rgba(255, 106, 106, 0.42);
  border-radius: 6rpx;
  padding: 6rpx 12rpx;
  margin-right: 12rpx;
  margin-bottom: 8rpx;
}
.ag-cc-entry {
  margin: 24rpx 0 0;
}
.ag-cc-entry-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  border: 1px solid var(--line-0);
  border-radius: var(--r-lg);
  background: var(--bg-1);
}
.ag-cc-entry-k {
  font-size: 26rpx;
  color: var(--ink-1);
}
.ag-cc-entry-v {
  font-size: 24rpx;
  color: var(--gold-0);
}
.ag-cc-entry-box {
  border: 1px solid var(--line-0);
  border-radius: var(--r-lg);
  background: var(--bg-1);
  padding: 20rpx 24rpx 24rpx;
}
.ag-cc-entry-hd {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14rpx;
}
.ag-cc-entry-x {
  font-size: 22rpx;
  color: var(--ink-2);
}
.ag-cc-input {
  width: 100%;
  height: 96rpx;
  box-sizing: border-box;
  padding: 0 18rpx;
  border: 1px dashed rgba(246, 207, 114, 0.42);
  border-radius: 8rpx;
  font-family: var(--font-mono);
  font-size: 30rpx;
  letter-spacing: 4rpx;
  color: var(--gold-0);
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 16rpx;
}
/* uni 的 input 默认按 1.4em 限高并裁切，这里把三层都放到同一行高 */
.ag-cc-input .uni-input-wrapper,
.ag-cc-input .uni-input-input,
.ag-cc-input .uni-input-placeholder {
  height: 96rpx;
  line-height: 96rpx;
  font-size: 30rpx;
}
.ag-cc-input .uni-input-input {
  color: var(--gold-0);
  letter-spacing: 4rpx;
}
.ag-cc-input .uni-input-placeholder {
  letter-spacing: 2rpx;
  color: var(--ink-2);
}
.ag-cc-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 14rpx;
}
.ag-cc-bar-k {
  font-size: 20rpx;
  letter-spacing: 2rpx;
  color: var(--ink-2);
  margin-right: 14rpx;
}
.ag-cc-bar-tip {
  font-size: 20rpx;
  color: var(--ink-2);
  opacity: 0.7;
  margin-left: 14rpx;
}
.ag-cc-input-ph {
  color: var(--ink-2);
  letter-spacing: 2rpx;
}
.ag-cc-msg {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  line-height: 1.6;
}
.ag-cc-msg--ok {
  color: var(--teal-0);
}
.ag-cc-msg--bad {
  color: var(--red-0);
}

/* ================= V4「一屏决策」紧凑版（390×844 不滚动） =================
   交易页（showDock 为真）才挂 --c 类，出身/模式/晚年/结局页的版式不动。
   尺寸一律用 px 而不是 rpx：rpx 会随窗口宽度放大，430 宽时整页会凭空长高 10%，
   而「一屏」这个预算不该跟着宽度变。 */

/* 底部 dock：8 + 46 + 4 + 20 + 8 = 86px（原 103px）。内容区的让位跟着 --dock-h 走。 */
page {
  --dock-pad-t: 8px;
  --dock-pad-b: 8px;
  --dock-btn-h: 46px;
  --dock-sub-gap: 4px;
  --dock-mini-fs: 11px;
  --dock-mini-lh: 16px;
  --dock-mini-py: 1px;
  --dock-sub-h: 20px;
  --dock-h: 86px;
  --dock-gap: 0px;
}
.ag-shell.ag-shell--c {
  padding: 6px 10px calc(var(--dock-h) + var(--dock-gap));
}
.ag-panel.ag-panel--tight {
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 9px;
}

/* 顶栏 20px + 挑战码 18px（原 39 + 100） */
.ag-topbar.ag-topbar--c {
  padding: 0 0 2px;
  height: 20px;
  align-items: center;
}
.ag-topbar--c .ag-brand-dot {
  width: 6px;
  height: 6px;
  margin-right: 6px;
}
.ag-topbar--c .ag-brand-t {
  font-size: 12px;
  letter-spacing: 2px;
}
.ag-topbar--c .ag-brand-sub {
  margin-left: 8px;
  font-size: 9px;
}
.ag-topbar--c .ag-tool {
  font-size: 10px;
  line-height: 16px;
  padding: 0 8px;
  margin-left: 6px;
}
.ag-cc-bar.ag-cc-bar--c {
  height: 18px;
  margin-bottom: 2px;
}
.ag-cc-bar--c .ag-cc-bar-k {
  font-size: 9px;
  letter-spacing: 1px;
  margin-right: 6px;
}

/* 目标条 + 贵贱条：一行双条 */
.ag-duo {
  display: flex;
  align-items: flex-start;
}

/* 警报：折成一行，多余省略（点开日志能看全文） */
.ag-alarm-line {
  display: flex;
  height: 16px;
  margin-bottom: 4px;
  overflow: hidden;
}
.ag-alarm-line-t {
  font-size: 9px;
  line-height: 14px;
  color: var(--red-0);
  border: 1px dashed rgba(255, 106, 106, 0.42);
  border-radius: 3px;
  padding: 0 4px;
  margin-right: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 展开后的走势块 */
.ag-chart-hd {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.ag-chart-hd-r {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-2);
}
.ag-chart-quote {
  display: block;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1.5;
  color: var(--ink-2);
}
.ag-chart-none {
  font-size: 9px;
  line-height: 1.5;
  color: var(--ink-2);
}
</style>