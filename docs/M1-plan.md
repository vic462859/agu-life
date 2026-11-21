# 《A股人生》产品化 · M1 计划

> 来源：豆包·妙搭托管的单文件游戏 https://4m86dnv1vrtsf.doubao.link/app/app_17jfcq5juyb （标题「A股人生」，豆包 AI 生成）
> 原始源码已抽取到 `default-workspace/.tmp-game/src/`：`game.js`(58KB 游戏逻辑) / `style.css`(12KB) / `body.html`。平台 runtime 丢弃。

## 0. 已定决策（来自 3 轮澄清，2026 对话）

| # | 决策 | 值 |
|---|---|---|
| D1 | 产品形态 | 网页精品单机 + 战绩分享卡；后端（账号/排行/每日挑战）后置 |
| D2 | 技术路线 | **uni-app(Vue3+TS+Vite) 一套代码 → 微信小程序 + H5 双端**；额外产出可回贴豆包的单文件 H5 |
| D3 | 内容骨架 | 保留 36 年真实上证季线 1991–2026；不加长不压缩 |
| D4 | 时长摩擦 | 快进 / 分段存档 / 中断续玩（手机端碎片化） |
| D5 | 视觉基调 | 数据图表为主 + 人生段落用年代质感包装（零外采美术，全部程序化生成） |
| D6 | M1 主打 | 体验与视觉重塑（"看起来像产品"） |
| D7 | M1 验收 | H5 本地完整玩一局 + 单测绿 + 双端构建绿 + 截图；微信侧给用户在开发者工具预览的操作清单 |
| D8 | 部署 | 公网用 GitHub Pages，M1 末尾做（凭据届时确认） |
| X1 | 排除 | 微信小游戏(Canvas 重画)、双份 UI、压缩到 12–15 年、M1 做后端 |

## 1. 里程碑

- **M1（本文件）双端骨架 + 内核移植 + 交易主界面视觉重塑 + 指数走势图**
  验收：`build:h5`/`build:mp-weixin` 双绿、`vitest` 全绿(≥6)、H5 可完整玩一局、截图证据。
- **M2 结算仪式感 + 分享战报卡 + 存档/续玩/快进 + 年代质感 token**
- **M3 微信真机验收清单 + GitHub Pages 部署 + 单文件回贴产物 + 文档**

## 2. 目录与归属（并行开发的边界）

```
agu-life/
  package.json vite.config.ts tsconfig.json index.html   # S1
  src/main.ts App.vue pages.json manifest.json uni.scss   # S1（骨架期）
  src/core/**            # S1 纯 TS 内核（无平台依赖）
    data/  rng.ts  engine/  selectors.ts  save.ts
  src/platform/storage.ts # S1 平台适配（uni storage）
  src/pages/index/index.vue # S1 先给"最小可玩"占位 → 之后归 S2
  src/ui/components/**      # S2（除 charts）
  src/ui/styles/**          # S2 设计令牌
  src/ui/components/charts/** # S3（自绘 canvas，不引图表库）
  tests/**                  # S1（vitest）
  docs/**                   # 我（dispatcher）
```

## 3. 内核契约（并行工作的接缝，S1 必须落地为代码）

```ts
type Phase = 'org' | 'mode' | 'trade' | 'late' | 'end'
type Tone  = 'r' | 'g' | 'gold' | 'a' | 'dim'
interface LogItem { text: string; tone: Tone }
interface RngLike { next(): number; int(n: number): number }        // mulberry32，可 seed
interface StepOutcome { state: GameState; logs: LogItem[]; kind: 'settled'|'event'|'late'|'end'|'busted' }
// 引擎全部纯函数：step(state, rng) / settle(...) / advance(...) / runAct(state, actId, subIdx, rng)
// UI 通过 composable useGame() 读：{ state, logs, pickSector, setPos, toggle, runAct, step, stepYear, restart }
```

硬约束：`src/core/**` 内不得出现 `uni.` / `window.` / `document.` / `localStorage`；随机一律走 `RngLike`；数值与文案保持原样（只做结构移植，不顺手动平衡）。

## 4. 风险（已路由）

1. uni-app 脚手架/依赖安装可能受网络影响 → S1 有 fallback 与重试预算，失败即报。
2. 小程序 canvas 与 H5 canvas API 不一致 → S3 必须双端构建验证，并提供非 canvas 降级路径。
3. 微信侧资质（主体/软著/ICP备案 7–20 工作日、企业主体需版号）**不在我能力范围** → M1 只做到"可导入开发者工具"，发布是用户后续外部流程。
4. 股票题材在小程序类目审核上有风险 → M3 文档中给出类目与合规表述建议（强调"模拟游戏，不构成投资建议"）。

## 5. 验收命令（M1）

```bash
cd agu-life
npx vitest run                 # 全绿，≥6 用例
npm run build:h5               # exit 0，dist/build/h5/index.html
npm run build:mp-weixin        # exit 0，dist/build/mp-weixin/app.json
npm run dev:h5                 # 我用于截图验收
```
