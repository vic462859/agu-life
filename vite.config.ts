import { defineConfig, type PluginOption } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// 这个包是 CJS 产物，vite 以 ESM 加载配置时 default 会被再包一层，这里两种形状都认。
type UniFactory = (options?: Record<string, unknown>) => PluginOption[]
const factory: UniFactory =
  (uni as unknown as { default?: UniFactory }).default ??
  (uni as unknown as UniFactory)

// GitHub Pages 是子路径部署（https://<user>.github.io/agu-life/），
// 而 uni 的 H5 产物默认把资源写成绝对路径 /assets/*，放到子路径会全部 404。
// 用相对 base 让同一个产物既能跑在 / 也能跑在任意子路径下（router 是 hash 模式，不依赖 base）。
// dev 下 vite 要求 base 以 / 开头，所以只在 build 时改成 './'。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [factory()],
}))
