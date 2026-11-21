#!/usr/bin/env node
/**
 * 一键把 mp-weixin 产物导入微信开发者工具并生成预览二维码。
 *
 * 前置（只做一次）：
 *   1) 已安装微信开发者工具，并已扫码登录（cli islogin 返回 {"login":true}）
 *   2) 已申请「小程序测试号」拿到 AppID —— 注意：小游戏测试号的 AppID 不能用，
 *      用它会报 "game.json: 未找到 game.json 文件"（实测见 docs/mp-preview.md）
 *
 * 用法：node scripts/mp-preview.mjs wx1234567890abcdef [--build]
 *   产物：docs/shots/mp-preview-qr.jpg（工具实际输出 JPEG，扫码即可在手机上看）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PROJ = path.join(ROOT, 'dist', 'build', 'mp-weixin');
const QR = path.join(ROOT, 'docs', 'shots', 'mp-preview-qr.jpg');

const appid = process.argv[2];
if (!appid || !/^wx[0-9a-f]{16}$/.test(appid)) {
  console.error('用法: node scripts/mp-preview.mjs wx<16位hex>');
  console.error('（AppID 必须来自「小程序测试号」，小游戏测试号会报 game.json 缺失）');
  process.exit(2);
}

const CLI = 'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';
if (!fs.existsSync(CLI)) {
  console.error('未找到微信开发者工具 CLI:', CLI);
  process.exit(3);
}

if (!fs.existsSync(path.join(PROJ, 'app.json')) || process.argv.includes('--build')) {
  console.log('产物不存在，先构建 mp-weixin ...');
  const b = spawnSync('npm', ['run', 'build:mp-weixin'], { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status || 1);
}

const pc = path.join(PROJ, 'project.config.json');
const cfg = JSON.parse(fs.readFileSync(pc, 'utf8'));
cfg.appid = appid;
cfg.compileType = 'miniprogram';
fs.writeFileSync(pc, JSON.stringify(cfg, null, 2));
console.log('appid ->', appid, '(compileType=miniprogram)');

function run(args, timeout = 120000) {
  const r = spawnSync(CLI, args, { input: 'y\n', encoding: 'utf8', timeout });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (out) console.log(out.slice(-800));
  return r.status;
}

fs.mkdirSync(path.dirname(QR), { recursive: true });
console.log('--- 打开项目');
run(['open', '--project', PROJ.replace(/\\/g, '/')]);
console.log('--- 生成预览二维码');
const code = run(['preview', '--project', PROJ.replace(/\\/g, '/'), '--qr-format', 'image', '--qr-output', QR]);
if (fs.existsSync(QR)) console.log('✓ 预览二维码:', QR);
else console.error('✗ 未生成二维码（看上面报错；game.json 相关报错 = AppID 是小游戏号）');
process.exit(code === 0 && fs.existsSync(QR) ? 0 : 1);
