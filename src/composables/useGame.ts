/** UI 与内核之间唯一的胶水：持有局面、持有随机源、把引擎返回值搬进响应式引用。 */
import { computed, shallowRef, ref, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import {
  chooseEvent,
  chooseLate,
  chooseYear,
  createGame,
  createRng,
  deserialize,
  endView,
  lateStep,
  lateView,
  openAct,
  pendingView,
  probeIntel,
  runAct,
  SAVE_KEY,
  serialize,
  setPosition,
  setSector,
  step,
  stepYear,
  toggle,
  tradeView,
  type EndView,
  type GameState,
  type LateView,
  type LogItem,
  type Mode,
  type OutcomeKind,
  type PendingEventView,
  type SectorId,
  type StepOutcome,
  type TradeView,
} from '../core'
import { createStorage, type StorageLike } from '../platform/storage'
import { createSfx, type Sfx } from '../platform/audio'

export interface UseGameOptions {
  storage?: StorageLike
  seed?: number
  sound?: boolean
  /** 日志最多留几条（原版 70）。 */
  logLimit?: number
}

export const SOUND_KEY = 'agu_snd'

export interface UseGame {
  state: ShallowRef<GameState | null>
  logs: Ref<LogItem[]>
  lastKind: Ref<OutcomeKind>
  view: ComputedRef<TradeView | null>
  late: ComputedRef<LateView | null>
  end: ComputedRef<EndView | null>
  pending: ComputedRef<PendingEventView | null>
  hasSave: Ref<boolean>
  begin(orgIndex: number, mode?: Mode, seed?: number): void
  resume(): boolean
  restart(): void
  pickSector(sect: SectorId): void
  setPos(pos: number): void
  toggleFlag(key: 'lev' | 'stop'): void
  probe(): void
  openGroup(group: string): boolean
  act(group: string, index: number): void
  stepOnce(): void
  stepWholeYear(): void
  choose(index: number): void
  save(): void
  clearSave(): void
  soundOn(): boolean
  toggleSound(): boolean
  sfx: Sfx
}

export function useGame(options: UseGameOptions = {}): UseGame {
  const storage: StorageLike = options.storage || createStorage()
  const logLimit = options.logLimit || 70
  const storedSound = storage.get(SOUND_KEY)
  const sfx = createSfx(options.sound !== false && storedSound !== '0')

  const state = shallowRef<GameState | null>(null)
  const logs = ref<LogItem[]>([])
  const lastKind = ref<OutcomeKind>('idle')
  const hasSave = ref<boolean>(!!storage.get(SAVE_KEY))
  let rng = createRng(options.seed != null ? options.seed : 19911219)

  const view = computed(function () {
    return state.value ? tradeView(state.value) : null
  })
  const late = computed(function () {
    return state.value && state.value.phase === 'late' ? lateView(state.value) : null
  })
  const end = computed(function () {
    return state.value && state.value.phase === 'end' ? endView(state.value) : null
  })
  const pending = computed(function () {
    return state.value ? pendingView(state.value) : null
  })

  function apply(out: StepOutcome): void {
    state.value = out.state
    lastKind.value = out.kind
    if (out.logs.length) {
      const fresh = out.logs.slice().reverse()
      logs.value = fresh.concat(logs.value).slice(0, logLimit)
    }
    for (let i = 0; i < out.fx.length; i++) sfx.play(out.fx[i])
    save()
  }

  function save(): void {
    if (!state.value) return
    storage.set(SAVE_KEY, serialize(state.value, Date.now()))
    hasSave.value = true
  }

  function clearSave(): void {
    storage.remove(SAVE_KEY)
    hasSave.value = false
    logs.value = []
    state.value = null
  }

  function freshSeed(): number {
    return options.seed != null ? options.seed : Date.now() % 2147483647
  }

  function begin(orgIndex: number, mode: Mode = 'real', seed?: number): void {
    const s = seed != null ? seed : freshSeed()
    rng = createRng(s)
    logs.value = []
    apply(createGame(orgIndex, mode, s, rng))
  }

  function resume(): boolean {
    const g = deserialize(storage.get(SAVE_KEY))
    if (!g) return false
    rng = createRng(g.seed || 19911219)
    logs.value = []
    state.value = g
    logs.value = [{ text: '接着上一次往下走。', tone: 'gold' }]
    lastKind.value = 'idle'
    return true
  }

  function restart(): void {
    storage.remove(SAVE_KEY)
    hasSave.value = false
    state.value = null
    logs.value = []
    lastKind.value = 'idle'
  }

  function pickSector(sect: SectorId): void {
    if (!state.value) return
    apply(setSector(state.value, sect))
  }

  function setPos(pos: number): void {
    if (!state.value) return
    apply(setPosition(state.value, pos))
  }

  function toggleFlag(key: 'lev' | 'stop'): void {
    if (!state.value) return
    apply(toggle(state.value, key))
  }

  function probe(): void {
    if (!state.value) return
    apply(probeIntel(state.value, rng))
  }

  /** 打开一扇门：能开返回 true；ap 用完时把提示写进日志并返回 false。 */
  function openGroup(group: string): boolean {
    if (!state.value) return false
    const out = openAct(state.value, group)
    if (out.logs.length) apply(out)
    return out.logs.length === 0
  }

  function act(group: string, index: number): void {
    if (!state.value) return
    apply(runAct(state.value, group, index, rng))
  }

  function stepOnce(): void {
    if (!state.value) return
    if (state.value.pending) return
    if (state.value.phase === 'late') apply(lateStep(state.value, rng))
    else apply(step(state.value, rng))
  }

  function stepWholeYear(): void {
    if (!state.value) return
    if (state.value.pending) return
    apply(stepYear(state.value, rng))
  }

  function choose(index: number): void {
    const g = state.value
    if (!g || !g.pending) return
    if (g.pending.type === 'event') apply(chooseEvent(g, index, rng))
    else if (g.pending.type === 'year') apply(chooseYear(g, index, rng))
    else apply(chooseLate(g, index, rng))
  }

  function soundOn(): boolean {
    return sfx.isOn()
  }

  function toggleSound(): boolean {
    const on = sfx.toggle()
    storage.set(SOUND_KEY, on ? '1' : '0')
    return on
  }

  return {
    state: state,
    logs: logs,
    lastKind: lastKind,
    view: view,
    late: late,
    end: end,
    pending: pending,
    hasSave: hasSave,
    begin: begin,
    resume: resume,
    restart: restart,
    pickSector: pickSector,
    setPos: setPos,
    toggleFlag: toggleFlag,
    probe: probe,
    openGroup: openGroup,
    act: act,
    stepOnce: stepOnce,
    stepWholeYear: stepWholeYear,
    choose: choose,
    save: save,
    clearSave: clearSave,
    soundOn: soundOn,
    toggleSound: toggleSound,
    sfx: sfx,
  }
}
