/* 开发工具：把 _tmp-poster.html 里 <pre id="out"> 的 dataURL 解成 PNG（1080×1440）。 */
const fs = require('node:fs')
const html = fs.readFileSync('docs/shots/_tmp-poster.html', 'utf8')
const m = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(html)
if (!m) { console.log('NO_DATAURL'); process.exit(1) }
const buf = Buffer.from(m[1], 'base64')
fs.writeFileSync('docs/shots/m2-poster.png', buf)
console.log('wrote m2-poster.png bytes=' + buf.length + ' wh=' + buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20))
