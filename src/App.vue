<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'

onLaunch(function () {
  // M1 阶段没有需要预热的全局资源；音效在用户第一次点击时才建 AudioContext。
})
</script>

<style>
@import './ui/styles/tokens.css';
@import './ui/styles/base.css';
@import './ui/styles/panels.css';
@import './ui/styles/eras.css';

page {
  background-color: var(--bg-0);
}
</style>
