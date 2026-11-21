# V3 · 小游戏侧同步（H5 → src/game）报告

对象：`src/game/**`（平台无关 canvas 渲染层）+ `minigame/game.js`。H5 侧（`src/ui/**`、`src/pages/**`、`src/core/**`）一行未改，只做 import。

## 1. 验收（命令 + 退出码 + 数）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 打包 | `npm run game:build` | exit **0**，产物 `dist-minigame/game.js` **170.4 KB**（V3 收尾 169.6 KB，V3.1 报纸重画 +0.8 KB；限额 260 KB，主包用掉 4.16%） |
| H5 预览 | `npm run game:dev` | 起在 127.0.0.1:5199，`/game-dev.html` 正常挂载并渲染（浏览器实测画面见下方说明） |
| 类型 | `npx vue-tsc --noEmit` | exit **0**，0 error |
| 单测 | `npx vitest run` | 18 文件 / **181 条全绿**（基线 155 条，只增不减；`tests/game-v3.test.ts` 18 条，其中 3 条是 V3.1 的静物断言） |
| 真产物自测 | `node docs/shots/_v3-wx-selftest.mjs` | exit **0**，见第 6 节 |

## 2. 四项 GOAL 落在哪

| # | 功能 | 落点 |
| --- | --- | --- |
| 1 | 交易页顶栏 40×48 头像 | `views/trade.ts: topBar()` → `drawPortrait(portraitFromTradeView(v), 40×48, {halo:false, ground:false})` |
| 1 | 结局屏 96×120 头像 | `views/over.ts: renderOver()` 第 1 层（身份条）→ `drawBust(portraitFromEndView(v), 96×120)`（32×40 逻辑网格 ×3，正好整除） |
| 2 | 36 年指数长图 | `app.ts: beginEnd()` 用 `buildQuarters(map).p0` → `yearlySeries`（进结局算一次）；`views/over.ts: indexChart()` 用 `layoutEndChart(values, w, h, 6, true)` 的几何填面积 + 2px 折线带 + 首末竖标 + 两个点 |
| 2 | 静物 | `views/over.ts` 第 5 层面板右端：`stillLifeFor(endView)` 选件 → `ui/share/portrait.ts` 的 **`drawStillLife()`**（与 H5 结局卡同一个函数）画进 **96×96 画框**（96/32 = 3 倍）。报纸的几何在共享层 `ui/share/stillLife.ts`，见第 10 节 |
| 3 | 挑战码 | `views/org.ts: codePanel()` 显示 `encodeChallenge(seed, mode)`；`app.ts: copyCode()/pasteCode()`；长按由 `app.ts` 的 down/frame/up 计时（`LONG_PRESS_S = 0.55s`，时间只来自 `frame(dt)`）；剪贴板走注入的 `ClipHost`（wx 层用 `getClipboardData/setClipboardData`，H5 层用 `navigator.clipboard`，都没有就只显示码不摆按钮） |
| 4 | 天赋 | 新增屏 `views/talent.ts` + `Screen = 'talent'`；数据 `core/meta.ts` 的 `talentRows/parseMeta/serializeMeta/unlock/carryTalent/award`；结局页显示「带天赋：XX 记忆点 +N（共 M）」 |

## 3. 复用 / 重画

**直接 import 复用（都是纯函数模块，只 import core 的类型，不带 DOM）**

| 模块 | 用到的东西 |
| --- | --- |
| `src/ui/share/portrait.ts` | `drawPortrait / drawBust / drawStillLife / portraitFromTradeView / portraitFromEndView` |
| `src/ui/share/endChart.ts` | `yearlySeries / layoutEndChart / stillLifeFor`（+ `StillKind` 类型） |
| `src/ui/share/sectorSeries.ts` | `sectorSeries`（板块卡右下角的迷你走势） |
| `src/core/challenge.ts` | `encodeChallenge / decodeChallenge / randomSeed` |
| `src/core/meta.ts` + `src/core/data/talents.ts` | 记忆点 / 解锁 / 带入 / 结算 / `talentName` |

**在本层重画（没有 import）**

| H5 模块 | 为什么不能直接用 | 重画了什么 |
| --- | --- | --- |
| `ui/components/EndCard.vue` 的 `paintChart/paintFace/paintStill` | 是 Vue 组件 + `acquireCanvas`（DOM），且 `clearRect/drawImage` 不在小游戏 ctx 契约里 | 只重画「落笔」这一层：`views/over.ts` 用 `beginPath/moveTo/lineTo/fill` 拼面积与折线带（契约里没有 stroke/lineWidth）；几何仍来自 `layoutEndChart` |
| `ui/components/ChallengeCode.vue` | Vue 组件 + `<input>` + 长按 DOM 事件 | `views/org.ts` 的挑战码面板（码 + 复制 + 粘贴上次的码），长按自己数 dt |
| `ui/components/TalentPicker.vue` | Vue 组件 + v-for | `views/talent.ts`（三行 + 不带），行数据仍来自 `talentRows` |
| `ui/components/AssetHead.vue` | Vue 组件 | 头像画进 `views/trade.ts` 的 topBar；不用 `clearRect`（整屏底色每帧重铺） |
| ~~`ui/share/portrait.ts` 的 STILL_PAPER 点阵~~（V3.1 的本地覆盖，V3.2 已撤） | 那一版只在 `src/game/stilllife.ts` 补画法，等于「H5 继续是差的那一版」 | 已在共享层解决：`ui/share/stillLife.ts` 的 `drawPaper()`，小游戏侧那个文件已删除（见第 10 节） |

> `src/ui/share/poster.ts` 早就被 `src/game/posterjob.ts` 复用了（战报），这轮没动。

## 4. 纵向高度预算（实测，390×844 CSS px，col.y = 23）

数不是估的：`docs/shots/_v3-budget.mjs` 在真浏览器里画一遍，从「面板底色的整列 fillRect」量出每块面板的真高（面板高度依赖 measureText）。

### 交易页（scroll = 0，也就是玩家第一眼看到的那一屏）

| 区 | 高 | 占位 |
| --- | --- | --- |
| 上边距 | 23 | 23 |
| 顶栏（资产大字 + **40×48 头像** + 年龄/连盈/音效 chip + 家/身体） | **204** | 23–227 |
| 上岸进度 | 104 | 237–341 |
| 贵贱条 | 82 | 351–433 |
| 板块卡 ×5（46 + 6 间隙） | 254 | 443–697 |
| 仓位 4 格 | 38 | 703–741 |
| 杠杆 / 止损 | 26 | 749–775 |
| 消息卡（两条 + 打探） | 234 | 785–1019 |
| 行动点 + 六扇门 + 打探 + **过一季/过一年** | 300 | 1029–1329 |
| 流水（7 行窗口） | 214 | 1339–1553 |

**头像的代价 = 0 px**：40×48 竖着塞在「账户资产 + 大字」这两行（22+38=60）里，顶栏公式一个数都没改（12+22+38+20+18+18+20+44+12 = 204）。实测五张板块卡底边 697 < 844，**没有一张被挤出屏幕**；决策按钮（过一季，y≈1260）本来就要滚一次，与加头像之前完全一致。

窄屏兜底：顶栏第 1 行 chips 从右往左排（最宽约 212 px），行首「账户资产」从 col.x+62 起 —— 390 宽下间距 34 px；320 宽以下会贴上，这是本层已知下限（见第 7 节）。

### 结局页

| 区 | 高 | 位置 |
| --- | --- | --- |
| 身份条（**96×120 胸像** + 标题 24 + 一句话，取两者高） | 132 | 29–161 |
| 金额 + 遗嘱 + 带天赋/记忆点 | 112 | 161–273 |
| 三十六年复盘（12 项两列） | 206 | 283–489 |
| 档案（6 段） | 306 | 499–805 |
| 那三十六年（长图 118 + **静物 96×96 框** + 两段话） | 260 | 815–1075 |
| 彩蛋 | 84 | 1085–1169 |
| 两个出口按钮 | 48 | 到 1231 |

长图与静物同一行：图宽 = 内宽 − 96 − 12，静物垂直居中，**不额外占高度**。

### 出身页 / 天赋页

| 屏 | 内容 | 底边 |
| --- | --- | --- |
| 出身 | 标题 68 + 3 张卡（132 + 12）×3 + **挑战码面板 76** | 630（844 屏不用滚；矮屏现在可整页滚） |
| 天赋 | 三行（114/94/114）+ 不带（48）+ 提示段 | 543 |

> 出身屏顺带修掉一个原有 bug：`本金 30,000 元` 与 `盘感 40 人脉 5 声望 0…` 原来挤同一行，390 宽实测重叠（见 v3-code.png 修复前后）。现在属性单独一行，每张卡 +20 px，仍在预算内。

## 5. 挑战码为什么不做全键盘输入

小游戏（game 类目）没有 WXML 视图层，也就没有 `<input>`：要输入只能自绘键盘 —— 26 字母 + 10 数字约 40 个命中区，至少占掉 380×160 的一块，再加一个「码体 7 位」的编辑状态机。而这条入口要解决的其实是**一件事**：把「我这一局」交给另一个人。所以给两条覆盖真实用法的路：

1. **复制**：点码或长按 0.55s → `setClipboardData`，发微信给朋友；
2. **粘贴我上次的码**：`getClipboardData` → `decodeChallenge`（core 的解析永不抛，失败给一句人话并退回随机 seed）。

代价写在明处：**不能手抄一张码进小游戏**（码本身 11 位 base32，抄得动，但没有输入框就进不来）；要手输请在 H5 端输。解析/换算一行没重写，全部走 `core/challenge.ts`。

## 6. 真产物自测（`docs/shots/_v3-wx-selftest.mjs`）

wx 桩覆盖：`createCanvas / getSystemInfoSync / onTouchStart / onTouchMove / onTouchEnd / onTouchCancel / getStorageSync / setStorageSync / getClipboardData / setClipboardData / canvasToTempFilePath / saveImageToPhotosAlbum`。驱动的是 **`dist-minigame/game.js` 真产物**（入口 `minigame/game.js` 挂的 `__AGU_GAME__`），点按走的是 wx 的 touch 回调，不是直接调 Game。

关键输出（一份完整贴在交付消息里）：

```
=== V3 小游戏真产物自测 ===
产物：dist-minigame/game.js  170.4 KB
挂载：wx.createCanvas #1 · 780×1688（dpr=2，390×844 CSS）
帧循环：真 rAF 桩下已画 3 帧，累计 fillRect 93 次
▸ 开局（出身页）  屏幕：org  命中区 6：org:0, org:1, org:2, code:copy, code:paste, code:copy
  挑战码：AGU-80BHCYA  剪贴板：可用   记忆点：6
▸ 点挑战码复制    剪贴板：AGU-80BHCYA（等于本局码：true）
▸ 长按 0.7s       剪贴板：AGU-80BHCYA（长按也能复制：true）
▸ 粘贴一条坏码    挑战码长度不对：应该是 AGU- 加 7 位，你给的是 4 位。
▸ 粘贴一条真码    认出挑战码 AGU-80BHCYA：史实模式，挑个出身就开这一局
▸ 点第一张出身卡  屏幕：talent  天赋三行：营业部的脸(锁 3 点) / 家里的灯(锁 3 点) / 看财报的手艺(锁 3 点)
▸ 点锁着的第一条  已解锁「营业部的脸」，再点一次带上路   记忆点：3
▸ 再点一次        屏幕：trade  带的天赋：rep
▸ 过完三季        季数：3  资产：36447
▸ 走到结局(107手) 屏幕：over
▸ 跳过六层仪式    含「那三十六年 · 指数」true  含「记忆点 +」true
                  带天赋：营业部的脸　记忆点 +4（共 7）
                  像素：长图面积填充 1 次 · 折线带填充 1 次 · 静物深色 47 笔
▸ 点「生成战报」  提示：已保存到相册  相册：wxfile://tmp/poster.png
▸ 点「再来一次」  回到：org  新码：AGU-9ENQHWM  跨局记忆点结余：7
=== 自测通过 ===
```

## 7. 决策与已知边界（取，可能错）

1. **记忆点 0 且没有任何解锁天赋时，跳过天赋屏**（出身卡点下去直接开局）。理由：那一屏会只剩一个「不带」按钮，是假选择，而且会让老测试（临时点 org:0 就该到交易页）全部改口。代价：新装机器的第一次开局看不到这一屏 —— 这是有意的。
2. **天赋屏只摆三行**（解锁的在前，锁着的按价钱跟在后面），不是六行全摊：一屏放得下三条 + 「不带」永远可见，比把池子摊开更重要。第 4 条之后的天赋要等下次进屏（解锁一条后会重排）。
3. **锁着的行点一下 = 花记忆点当场解锁**（留在原屏），再点一次才是「带上路」。这是 H5 TalentPicker 的同一套语义，只是把「解锁」和「选择」拆成两次点击，避免误花点数。
4. **seed 在启动时就定**（`randomSeed()`），开局屏上那张码印的就是这一局真正要用的 seed；「再来一次」换新 seed，码跟着换。没有内存种子的路径了。
5. **挑战码只带 seed + 模式，不带天赋**（码制是 core 定的，2 位模式位已经占满）：所以带天赋的局结局页必须标「带天赋：XX」，同一个码不同天赋不能直接比 —— 这句话也印在天赋屏底部。
6. **已知下限**：顶栏第一行 chips（音效/年龄/连盈）与行首「账户资产」在 320 px 宽以下会贴上；这次没做窄屏折叠（真机现在基本都是 ≥ 360）。要改就在 topBar 里按 `w < 240` 把「连盈」chip 省掉。
7. **板块迷你走势在 qi = 0 时是空白**（`sectorSeries` 没有历史就返回空数组）：第一季看不见线，第二季起才有。这是口径本身，不是 bug。
8. 本轮**没有**动 `src/core/**`、`src/ui/**`、`src/pages/**`、`scripts/**`、`package.json`、`vite.config.ts`；`src/game/**` 里除 `runtime/*` 外仍无 `uni./document./window./wx.`（`tests/game-v3.test.ts` 有一条源码级断言守着它，还顺带守着「`src/ui` 不反向 import 小游戏层」）。

## 8. 截图

| 文件 | 内容 |
| --- | --- |
| `docs/shots/v3-trade.png` | 交易页：顶栏 40×48 头像 + 五张板块卡（每张右下角一条相对大盘的迷你走势） |
| `docs/shots/v3-end.png` | 结局页：36 年指数长图（对数轴、面积 + 折线带 + 首末竖标）+ 右下角静物（画框内） |
| `docs/shots/v3-end-top.png` | 结局页顶部：96×120 胸像 + 标题 + 金额 + 「带天赋：XX 记忆点 +N（共 M）」 |
| `docs/shots/v3-talent.png` | 天赋三选一（一条已解锁带「带这一样 →」，两条锁着）+ 不带天赋 |
| `docs/shots/v3-code.png` | 开局屏：三张出身卡 + 挑战码面板（码 / 复制 / 粘贴上次的码） |

生成器：`docs/shots/_v3-shots.mjs`（esbuild 打包 `src/game/app.ts` → 真浏览器 canvas → PNG POST 回来）；量尺：`docs/shots/_v3-budget.mjs`（`_v3-budget.json` 是原始数）。
## 9. V3.1 · 报纸那件静物的辨识度（做法已被第 10 节取代，结论仍有效）

> 这一节记录的是**当时的判断与做法**：只在 `src/game/stilllife.ts` 补了一份画法。
> 它修对了小游戏，却把 H5 留在原样 —— 第 10 节把几何上提到共享层，本地那份已删。
> 下面关于「根因在点阵本身」的诊断与「另外四件一件没动」的结论，两句都仍然成立。

**问题**：`paper`（揉皱的报纸）在 96×96 画框里是一团白色噪点。

**根因在共享内核，不在本层**：`ui/share/portrait.ts` 的 `STILL_PAPER` 是一张 18×9 的 ASCII 点阵，二十来列里几乎每格都是白块（只留几个 `-` 当阴影）—— 填满率太高，放大 3 倍后只剩一片白，没有任何轮廓可读。`drawStillLife` 的几何没问题（32×32 格、`scale = floor(min(w,h)/32)`、居中），问题在点阵本身。

**处置**：那份文件与 H5 结局卡共用且只读，所以**不改它**，只在小游戏侧补一层：新增 `src/game/stilllife.ts` 的 `drawStill(ctx, kind, x, y, size, bg)`。

- `kind === 'paper'` → 走本层的 32×32 格线画法（1 格 = `size/32`，96 → **正好 3px**，所有矩形都落格线，放大 3 倍不糊）：
  - 上下两半纸面（下半张左右各多出 1 格，才看得出「叠着」）
  - **折缝**：两半之间一道硬阴影（`bg0`）
  - **2 条整幅折痕暗线**（`ink2`）+ 3 行短印刷行（只占左边一截，与折痕区分）
  - **浅色边缘**：上沿与左沿 `#ffffff` 受光；右沿与下沿 `ink1` 背光（有这两道纸面才有厚度）
  - **不规则缺口**：右上角撕掉两口、左下角揉掉一块 —— 用画框底色「擦」出来（不是画白线盖上去）
- 其余四件 → 原样转手给 `drawStillLife`（一件都不多画，有单测逐条比对两边的 fillRect 完全一致）。

**另外四件的判断（放大 4 倍逐件看，图见 `docs/shots/v3-stilllife.png` 下排）**：glass 有杯身与高脚、case 有提手与扣、cane 有弯钩与杆、pill 有盖子与十字 —— 都认得出，**一件都没动**。

**证据**：
- `docs/shots/v3-stilllife.png`：上排小游戏侧现在这套 / 下排共享内核原样，五件并排、每格 96 放大 4 倍（关插值）。对比图上「报纸」的差别一眼可见，另外四件两排逐像素一致。
- `docs/shots/v3-end.png`：结局页重出，画框里那件现在是折起来的报纸。
- 单测（`tests/game-v3.test.ts`）3 条：① 所有笔落在框内且 `x/y/w/h` 对齐 3px 格线；② 纸面/受光边/折痕/缺口四种颜色都在，且下一半比上一半宽 6px（叠着的证据）；③ 另外四件与 `drawStillLife` 逐笔相同。
- `npm run game:build` exit 0，**170.4 KB**（+0.8 KB）；`vue-tsc` 0 error；`vitest` 181 条全绿（178 → 181，只增不减）。

**边界（说清楚，免得下次又踩）**：缺口是靠「用画框底色擦」实现的，所以 `drawStill` 的 `bg` 参数必须等于实际底色（缺省 `C.bg2`，结局页那个框正是它）。若哪天把静物摆到别的底色上，要显式传 `bg`，否则缺口会留下一块浅斑。
## 10. V3.2 · 报纸几何上提到共享层（H5 一起修好，本地覆盖已删）

**为什么必须做**：V3.1 只修了小游戏侧，而 H5 结局卡用的还是同一张 18×9 白点阵 —— 也就是说「用户真正在看的那一版」仍然是差的。同一件静物两端不一致，比两端都差更糟。

**做了什么**

| 动作 | 文件 |
| --- | --- |
| 新建共享模块：paper 的 32×32 格线几何（纯函数、注入 ctx、只用 `fillRect` + `fillStyle`） | `src/ui/share/stillLife.ts`（`drawPaper` + `DEFAULT_STILL_COLORS` + `StillCtx`） |
| `drawStillLife` 顶部改为委托（paper → `drawPaper`；其余四件原样）；删掉死掉的 `STILL_PAPER` 点阵与它的分支；对外签名不变 | `src/ui/share/portrait.ts` |
| 小游戏结局屏改回调 `drawStillLife`（与 H5 同一个入口），删掉本地覆盖 | `src/game/views/over.ts`；**删除** `src/game/stilllife.ts` |
| 测试：共享模块的格线/颜色/缺口 + 「五件全部来自共享内核」的逐笔比对 + 源码级「小游戏层不再有本地 paper 画法」 | `tests/game-v3.test.ts` |

**一个偏离委托的取舍（写清楚，免得被当成漏项）**：原计划是「`bg` 显式参数 + H5 显式传底色」，实测改成了**缺口是真的洞** —— 纸面按缺格拆成几块画，不拿底色去盖：

- H5 那张静物画布是**透明的**（`EndCard.vue` 的 `paintStill` 先 `clearRect` 再画），拿底色擦 = 在透明的卡片上盖一块 `#0f1620` 的浅斑；
- 「真的洞」在两种底上都对：小游戏那张不透明画布露的是 `views/over.ts` 铺的 `bg2`，H5 露的是卡片自己的底色；
- 所以 `drawPaper` 没有 `bg` 参数，`EndCard.vue` **一个字没改**（它也不需要改）。

**证据**

| 项 | 结果 |
| --- | --- |
| `grep -rn "STILL_PAPER" src/` | **无输出（exit 1）** —— 那张白点阵在仓库里已经不存在 |
| `npm run game:build` | exit **0**，`dist-minigame/game.js` **170.6 KB** |
| `npm run build:h5` | exit **0**（`dist/build/h5`） |
| `npx vitest run` | **184 条全绿**（181 → 184；只增不减） |
| `npx vue-tsc --noEmit` | **0 error** |
| `docs/shots/v3-end-h5.png` | H5 结局卡（真产物 `dist/build/h5` + 真 Chrome）：右上角那件静物是折起来的报纸 |
| `docs/shots/_v3-h5-still-zoom.png` | 同一张卡的静物格放大 6 倍（`Page.captureScreenshot` 的 clip） |
| `docs/shots/v3-stilllife.png` | 两排都调同一个 `drawStillLife`：上排复刻小游戏结局屏（bg2 画框），下排复刻 H5 结局卡（透明画布 + 卡片底色）；页面自检「同一函数两次调用的 fillRect 指令逐条一致」= `glass:true/14 case:true/17 paper:true/17 cane:true/20 pill:true/20` |
| `docs/shots/v3-end.png` | 小游戏结局页重出（报纸的缺口现在是真的洞） |

**H5 那张卡上它有多大（说清楚，别期待）**：`EndCard.vue` 的静物框是 `STILL_BOX = 76` CSS，`drawStillLife` 的 `scale = floor(min(w,h)/32) = 2` ⇒ 报纸本体 21×16 格 = **42×32 CSS**，与另外四件同一档（公文包 14×9 格 = 28×18）。要更大得改 `STILL_BOX`，那是卡片版式的事，本轮不在范围内 —— 但像素探针能证明它不是白屏：`w=152 h=152 opaque=4480`，主色 `234,241,248×2176`（纸白）/ `107,121,139×1664`（折痕）/ `255,255,255×640`（受光边）。

**边界（V3.1 那条边界已经不存在了）**：`drawPaper` 不需要底色，所以「换底色要显式传 bg」这条限制随重构一起消失；反过来说，谁要是把静物画在**已经铺了纸色**的区域上，缺口会露出底下那层 —— 这是「洞」的正确行为。
