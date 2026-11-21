# 部署：GitHub Pages（H5 公网版）

产物：`dist/build/h5`（SPA，hash 路由）。发布方式：**官方 Actions 发布流程**（upload-pages-artifact + deploy-pages），
工作流文件：`.github/workflows/pages.yml`。

## 0. 前置（现状提醒）

**本机这份工程还不是 git 仓库**（`git -C agu-life rev-parse` 报 `not a git repository`），也**没有配置远端**。
所以工作流只是写好了文件，一次都没在真实 GitHub 上跑过。首次上线要人工做：

```bash
cd agu-life
git init -b main
printf 'node_modules/\ndist/\nagu-life.html\n' > .gitignore     # 现在没有 .gitignore，不加会把 node_modules 推上去
git add -A && git commit -m "chore: init agu-life"
git remote add origin git@github.com:<你的账号>/agu-life.git    # 远端写操作由你来做
git push -u origin main
```

> 仓库根目录必须是 `agu-life` 项目根（`package.json` 所在目录），工作流里的路径都按这个假设写。

## 1. 仓库可见性要求

- **公开仓库**：GitHub Pages 免费可用，不需要额外付费。
- **私有仓库**：要发 Pages 需要付费账号（个人 GitHub Pro，组织 Team/Enterprise）。免费个人账号在私有仓库上
  开不了 Pages，Actions 会失败而不是发布。
- 若必须私有：改成发布到别处（Vercel/Netlify/对象存储），或升级账号——这不是代码能解决的。

## 2. 打开 Pages（只需一次，人工点）

仓库 → **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
不选这一项，`deploy-pages` 会因为没有 Pages 站点而失败。

## 3. 首次发布

```bash
git push origin main        # 由你执行，本任务禁止任何远端写操作
```

或在 Actions 页面手动触发一次：仓库 → Actions → 「Deploy H5 to GitHub Pages」→ Run workflow（工作流带了 `workflow_dispatch`）。

成功后站点地址：`https://<账号>.github.io/<仓库名>/`（例如 `https://someone.github.io/agu-life/`）。

## 4. 子路径配置：为什么动了 vite.config.ts

Pages 的项目站点是**子路径**部署（`/<repo>/`）。而 uni 的 H5 产物默认把资源写成绝对路径
`/assets/index-xxxx.js`，部署到 `/agu-life/` 会全部 404，页面白屏。

处理方式：`vite.config.ts` 里给 build 加相对 base：

```ts
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',   // build 用相对路径，dev 仍用 '/'
  plugins: [factory()],
}))
```

- 构建后 `dist/build/h5/index.html` 里是 `src="./assets/index-xxxx.js"`、`href="./assets/uni-xxxx.css"`，
  子路径、根路径、本地静态服务都能跑，不需要知道仓库名。
- 为什么不用 `/agu-life/` 硬编码：仓库名不一定叫 agu-life（改名就白屏），而相对 base 与仓库名无关。
- 为什么 `src/manifest.json` 没动：`h5.router.mode` 是 `hash`，路由不依赖 base；`h5.router.base` 留空即可。
  **只改了 `vite.config.ts` 这一处**，且只在 build 生效，dev server 行为不变。
- 单文件导出（`scripts/single-file.mjs`）同样受益：它的自检条件就是"没有 `src="./assets"` 这类外链"。

## 5. 回滚

三种方式，按代价从低到高：

1. **重跑旧的成功流水线**：Actions → 选中上一次成功的 run → 右上 **Re-run all jobs**。
   注意：它用的是那次 run 对应 commit 的代码，会把线上重新发布成那个版本。
2. **环境页 Redeploy**：仓库 → Settings → Environments → `github-pages` → 历史部署列表里选一个版本重新部署。
   （按 GitHub 现行文档，环境页可对历史部署 Redeploy；本机未实测，若入口不存在就走第 1 或第 3 种。）
3. **代码回退再推**：`git revert <坏提交>` 或 `git checkout <tag> && git push --force`（慎用 force），
   让流水线用旧代码重建一次——这是唯一"源码与线上一致"的回滚方式。

> 不要手动删 Pages 上的文件：发布走 artifact，下一次 workflow 会整体覆盖，手动删只会让人怀疑现网状态。

## 6. 常见失败

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Get Pages site failed` | Pages 没打开或 Source 不是 GitHub Actions | 按第 2 节设置 |
| `npm ci` 失败 | 没有 package-lock.json 或与 package.json 不一致 | 本地 `npm install` 后提交 lock 文件 |
| 页面白屏、控制台 404 | base 不是相对路径（有人改回去了） | 检查 `vite.config.ts` 的 `base` |
| `npm test` 挡住发布 | 单测红了 | 先修测试；这一步故意放在 build 前，红就不发布 |
| 私有仓库 Actions 成功但没有站点 | 私有仓库 Pages 需付费账号 | 见第 1 节 |
