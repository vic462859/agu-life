# A股人生 · 36 年 A 股模拟人生

一款用 uni-app（Vue 3 + TypeScript + Vite）写的单机模拟游戏：从 1984 年 18 岁选出身开始，
在 1991—2026 的 A 股里做 36 年选择（本金 / 盘感 / 人脉 / 声望 / 身体 / 家庭六个维度）。
**一句话边界：本产品为模拟游戏，不构成任何投资建议。**

## 目录结构

```
agu-life/
├── index.html              # H5 入口模板（uni 注入 app-html / preload-links）
├── vite.config.ts          # 唯一的环境准备：build 时 base 用相对路径（子路径部署）
├── src/
│   ├── main.ts             # uni 应用启动
│   ├── App.vue
│   ├── pages.json          # 两个页面：pages/index/index、pages/chart-lab/chart-lab
│   ├── manifest.json       # 应用名 / 版本 / h5.router(mode=hash) / mp-weixin 配置
│   ├── core/               # 纯逻辑（无框架依赖，vitest 直接测）
│   │   ├── engine/         # step / settle / events / market / actions / state
│   │   ├── data/           # 由 scripts/extract-data.mjs 生成的静态数据（勿手改）
│   │   ├── rng.ts save.ts selectors.ts types.ts
│   ├── ui/                 # 组件 + 设计令牌（styles/tokens.css, base.css, panels.css）
│   ├── composables/        # useGame（页面级状态机）
│   ├── platform/           # storage / audio（跨端适配）
│   └── pages/              # 页面：index（主流程）、chart-lab（图表试验台）
├── tests/                  # vitest：tests/core.test.ts 等
├── scripts/
│   ├── serve-h5.mjs        # 本地起静态服务预览 dist/build/h5
│   ├── single-file.mjs     # 把 dist/build/h5 内联成单文件 agu-life.html
│   ├── smoke.mjs           # 零依赖冒烟（静态服务 + headless Chrome dump-dom 断言）
│   ├── extract-data.mjs    # 从原始 game.js 抽静态数据到 src/core/data
│   └── verify-copy.mjs verify-market.mjs   # 文案 / 行情数据自检
├── .github/workflows/pages.yml   # push main -> 构建 H5 -> 发布 GitHub Pages
└── docs/                   # README.md mp-preview.md deploy.md shots/
```

## 环境

- Node 22.23.2（本机实测版本；CI 用 Node 20，二者都能构建）
- npm 12.0.2
- 冒烟脚本额外需要本机 Chrome（路径不在默认位置时用 `CHROME_PATH` 指定）

安装依赖（首次）：

```bash
cd agu-life
npm ci
```

## 开发

```bash
npm run dev:h5          # H5 开发服务器（浏览器里调）
npm run dev:mp-weixin   # 微信小程序开发（产物 dist/dev/mp-weixin，用微信开发者工具导入）
npm run type-check      # vue-tsc --noEmit，只管类型
```

## 测试

```bash
npm test
```

本机实测输出：`Test Files 2 passed (2)` / `Tests 33 passed (33)`。

## 双端构建

```bash
npm run build:h5         # 产物 dist/build/h5（H5 单页，hash 路由）
npm run build:mp-weixin  # 产物 dist/build/mp-weixin（微信小程序）
```

H5 产物是 SPA，必须从服务根起服，直接双击 index.html 打不开。本地预览：

```bash
node scripts/serve-h5.mjs 5199    # 然后开 http://127.0.0.1:5199
```

## 导出单文件版（可回贴豆包 / 直接发给人）

```bash
npm run build:h5
node scripts/single-file.mjs      # 产出项目根的 agu-life.html
```

- 产物 `agu-life.html` 自包含：CSS 合并成一个 `<style>`，所有 JS chunk 以字符串内联、运行时用 Blob + importmap 还原成模块图（产物里 entry 与 page chunk 互相 import，是环，无法简单拼字符串）。
- 本机实测：359.5 KiB（368,093 bytes，对应 12:50 那份 dist），外部资源引用 0 条，file:// 直接打开可用（`docs/shots/m2b-singlefile.png` 就是它跑起来的样子）。体积随 `src/**` 变化，重新构建后以脚本打印的为准。
- 单个文件双击即跑，但若某个 chunk 内联失败，脚本会打印跳过的资源并在 HTML 里保留原引用（当前产物没有这种情况）。

## 冒烟

```bash
node scripts/smoke.mjs            # 默认端口 5300，可传 node scripts/smoke.mjs 5301
```

它会：起本地静态服务（`/` 指向 dist/build/h5，`/single` 指向 agu-life.html）→ 用
`chrome --headless --dump-dom` 抓两边的 DOM → **先删掉所有 `<script>` 再断言**（防止"脚本文本里
恰好有这几个字"的假绿）→ 断言出现「你从哪儿来」与 `id="org-0"`。全绿打印 `PASS` 并 exit 0，否则 `FAIL` + exit 1。

## 已知未验证项

- GitHub Actions 工作流没有在真实仓库跑过（本机没有 git 仓库、也没有远端凭据），见 `docs/deploy.md`。
- 微信小程序只在构建层面通过，真机与微信开发者工具导入未验证，见 `docs/mp-preview.md`。
