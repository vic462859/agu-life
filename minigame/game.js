// 微信小游戏入口（构建输入）。dist-minigame/game.js = 这个文件 + src/game 的单文件产物。
import { mountWx } from '../src/game/runtime/wx'

const game = mountWx()

// 调试句柄：真机上没人读它；wx 桩（Node）靠它把局面驱动到结局再验海报导出。
if (typeof globalThis !== 'undefined') {
  globalThis.__AGU_GAME__ = game
}
