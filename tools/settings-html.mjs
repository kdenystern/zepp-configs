// Writes an app's settings page as a plain HTML file, to check its layout and
// colours without the phone. The real components belong to the Zepp app and
// are not public, so this only imitates them: View is a div, Text a p or
// span, TextInput a label over its value, Button a button with the uppercase
// Material look the Zepp app's buttons start from. The page around it is
// white with a margin, the worst case for a dark page.
//
//   node --import ./test/support/register.mjs tools/settings-html.mjs tasks out.html
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { root } from './sharp.mjs'
import { loadApp, reset, world, startApp, flush, settingsPage, settingsStorage, nodes, tap, button } from '../test/support/harness.mjs'

const [app, out] = process.argv.slice(2)
if (!['launcher', 'nutrition', 'weather', 'tasks', 'water'].includes(app) || !out) {
  console.error('usage: settings-html.mjs launcher|nutrition|weather|tasks|water <file.html>')
  process.exit(1)
}

const entry = await loadApp(app)
reset()

// Something to look at on each page.
if (app === 'launcher') {
  settingsStorage.setItem('config', 'timer\nNutrition = app:68232:page/index @food\nTasks = app:68235:page/index @todo\nCalc = app:1:page/index @nosuchicon')
} else if (app === 'nutrition') {
  startApp(entry)
  await flush()
  tap(button('Meal: 600 kcal, 35 g'))
  await flush()
} else if (app === 'weather') {
  const sample = JSON.parse(readFileSync(join(root, 'test/fixtures/open-meteo-forecast.json'), 'utf8'))
  const place = (name, admin1, country) => ({ name, admin1, country, latitude: 1, longitude: 2 })
  world.internet = (url) =>
    url.includes('geocoding')
      ? { results: [place('Springfield', 'Missouri', 'United States'), place('Springfield', 'Illinois', 'United States')] }
      : sample
  nodes(settingsPage(), 'TextInput')[0].props.onChange('Springfield')
  await flush()
} else if (app === 'water') {
  // The defaults are what there is to see.
} else {
  const add = (text) => nodes(settingsPage(), 'TextInput')[0].props.onChange(text)
  ;['Take pills every day', 'Workout every 3 days', 'Buy milk and star anise', 'Call the dentist', 'Bins every Thu'].forEach(add)
  const done = () => nodes(settingsPage(), 'Button').filter((b) => b.props.label === 'Done')
  done()[3].props.onClick()
}

const escape = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const css = (style = {}) =>
  Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${value}`)
    .join(';')

function html(node) {
  if (typeof node === 'string') return escape(node)
  if (!node) return ''
  const { type, props, children } = node
  const inner = children.map(html).join('')
  if (type === 'View') return `<div style="${css(props.style)}">${inner}</div>`
  if (type === 'Text') {
    const tag = props.paragraph ? 'p' : 'span'
    return `<${tag} style="${props.bold ? 'font-weight:bold;' : ''}${css(props.style)}">${inner}</${tag}>`
  }
  if (type === 'TextInput') {
    const value = 'value' in props ? `<div style="${css(props.subStyle)}">${escape(props.value)}</div>` : ''
    return `<div><div style="${css(props.labelStyle)}">${escape(props.label)}</div>${value}</div>`
  }
  if (type === 'Button') return `<button class="zepp" style="${css(props.style)}">${escape(props.label)}</button>`
  return `<div style="outline:2px solid red;color:red">${type}?</div>`
}

writeFileSync(
  out,
  `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${app} settings</title>
<style>
  body { margin: 8px; background: #fff; color: rgba(0, 0, 0, 0.87); font: 16px/1.5 Roboto, Helvetica, Arial, sans-serif; }
  button.zepp { font: 500 14px/1.75 Roboto, Helvetica, Arial, sans-serif; text-transform: uppercase; padding: 6px 16px;
    border: 0; border-radius: 4px; background: #e0e0e0; color: rgba(0, 0, 0, 0.87);
    box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px rgba(0, 0, 0, 0.14); }
</style>
${html(settingsPage())}
`,
)
console.log('wrote ' + out)
process.exit(0)
