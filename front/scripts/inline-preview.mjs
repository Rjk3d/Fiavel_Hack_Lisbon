// Builds one self-contained HTML page (inline JS + CSS, Inter from Google Fonts) for a hosted preview.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dir = 'dist/assets'
const files = readdirSync(dir)
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script')
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8').replace(/@font-face\{[^}]*\}/g, '')

const html = `<title>Fiável</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap">
<style>:root{color-scheme:light}html,body{background:#FAF9FD}${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`
writeFileSync(process.argv[2] ?? 'dist/preview.html', html)
console.log('preview written', (html.length / 1024).toFixed(0), 'kB')
