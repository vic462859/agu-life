# M4 · 微信小游戏路线（Canvas 重写表现层）

## 0. 为什么走这条
已证实：`wx40e368815564c258` 是小游戏账号（小游戏工程能出预览码；小程序工程报 `game.json 未找到`）。用户决定走小游戏。
资质结论：**无内购小游戏 = 备案即可，不需要版号**；个人主体不能内购（我们也不需要）。发布另需 ICP 备案。

## 1. 架构（关键约束）
渲染层必须**平台无关**，否则只能在小游戏里调试。

- `src/core/**`：不动（纯 TS 引擎，33 条测试）
- `src/ui/share/poster.ts`：不动（canvas 纯函数绘制）
- `src/ui/components/charts/geometry.ts`、`paint.ts`：复用
- `src/game/theme.ts`：颜色/字号/间距 token（tokens.css 的 canvas 镜像，文件头注明双源）
- `src/game/text.ts`：中文换行、截断、省略号
- `src/game/layout.ts`：栈式布局 + 命中区域登记（不依赖 DOM）
- `src/game/views/`：title / org / trade / event / late / end / poster / resume
- `src/game/app.ts`：状态机 + 主循环 + 输入分发（注入 ctx/storage/input/audio）
- `src/game/runtime/h5.ts`：`<canvas>` + pointer/touch + localStorage
- `src/game/runtime/wx.ts`：`wx.createCanvas` + touch + wx storage + InnerAudio
- `minigame/game.json` + `game.js`：小游戏入口

## 2. 里程碑
- **MG1 骨架跑通**：`npm run game:dev` 在本地 H5 出画面（可截图验收）；`npm run game:build` 产出小游戏包；`node scripts/minigame-preview.mjs <appid>` 生成预览二维码。此阶段只做出身选择 → 交易页（简化版）→ 过一季。
- **MG2 交易页完整**：顶栏/目标条/贵贱条/板块卡/仓位/杠杆止损/七扇门/消息卡/日志流（含虚拟滚动）。
- **MG3 弹层与结局**：年度事件卡、结局六层仪式、海报（直接复用 poster.ts）、续玩弹窗、快进、音效。
- **MG4 真机与上线**：真机走查、帧率与包体、小游戏备案材料清单、审核表述。

## 3. 验收口径
- 每个里程碑必须有：本地 H5 截图（我看）+ 小游戏预览码（你扫）+ 构建退出码。
- 不允许在 `src/core/**` 里加平台判断；内核保持一行一行可测。

## 4. 风险
1. 中文排版（换行/字重/行高）是最大工作量，也是产品质感命门 → 先做 `text.ts` 并单测。
2. 小游戏包体主包 4MB：不引引擎、不引第三方库。
3. 审核：坚持「模拟游戏，不构成投资建议」，类目走游戏。