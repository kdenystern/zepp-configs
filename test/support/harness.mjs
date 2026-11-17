// Test helpers: load an app's real modules against the mocks and poke at it.
import { readFileSync } from 'node:fs'

import {
  registry,
  world,
  resetWorld,
  startApp,
  closeApp,
  startWatchface,
  resumeWatchface,
  settingsStorage,
} from './world.mjs'
import { setMissingSystemApps } from './zos/router.js'

export { world, startApp, closeApp, startWatchface, resumeWatchface, settingsStorage }
export { systemAppId } from './zos/router.js'

const apps = new URL('../../apps/', import.meta.url)

// Imports every module app.json names. Modules load once per process, so use
// one app per test file. Returns the entry page url (null for a watch face).
export async function loadApp(name) {
  const base = new URL(name + '/', apps)
  const manifest = JSON.parse(readFileSync(new URL('app.json', base), 'utf8'))
  const modules = manifest.targets.default.module

  registry.appId = manifest.app.appId
  await import(new URL('app.js', base))
  if (modules.watchface) {
    await import(new URL(modules.watchface.path + '.js', base))
    return null
  }
  for (const url of modules.page.pages) {
    registry.loading = url
    await import(new URL(url + '.js', base))
  }
  registry.loading = null
  await import(new URL(modules['app-side'].path + '.js', base))
  await import(new URL(modules.setting.path + '.js', base))
  return modules.page.pages[0]
}

// Back to a factory-fresh watch and phone.
export function reset({ missingSystemApps = [] } = {}) {
  resetWorld()
  setMissingSystemApps(missingSystemApps)
}

// Lets pending request/response promises settle.
export const flush = () => new Promise((resolve) => setImmediate(resolve))

export const widgetsOf = (type) => world.widgets.filter((w) => w.type === type && w.visible)
export const buttons = () => widgetsOf('BUTTON')
export const button = (text) => {
  const found = buttons().find((b) => b.params.text === text)
  if (!found) throw new Error(`no button "${text}"; have: ${buttons().map((b) => b.params.text).join(', ')}`)
  return found
}
export const tap = (w) => w.params.click_func(w)
export const texts = () => widgetsOf('TEXT').map((w) => w.params.text)
export const images = () => widgetsOf('IMG').map((w) => w.params.src)

// The settings page as a tree of { type, props, children }.
export const settingsPage = () => registry.settingsPage.build({ settingsStorage })

export function nodes(tree, type) {
  const out = []
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === type) out.push(node)
    node.children.forEach(walk)
  }
  walk(tree)
  return out
}

// A settings page is made of cards: a View on the page that starts with its
// title.
export const settingsCards = (tree) =>
  tree.children.filter((node) => node.type === 'View' && node.children[0] && node.children[0].type === 'Text')
export const cardTitle = (card) => card.children[0].children.join('')

// The settings pages are dark, and that only holds if every component is told
// its own colours: the Zepp app's defaults are dark text on white.
export function assertDark(tree) {
  const fail = (message) => {
    throw new Error('settings page: ' + message)
  }
  if (tree.type !== 'View' || tree.props.style.background !== '#121315') fail('the page itself is not dark')
  for (const type of ['Section', 'Select', 'Toggle']) {
    if (nodes(tree, type).length) fail(`${type} is used, whose colours cannot be set`)
  }
  for (const node of nodes(tree, 'Text')) {
    if (!node.props.style || !node.props.style.color) fail(`no colour for the text "${node.children.join('')}"`)
  }
  for (const node of nodes(tree, 'TextInput')) {
    if (!node.props.labelStyle || !node.props.labelStyle.color) fail(`no colour for the label "${node.props.label}"`)
    if ('value' in node.props && !(node.props.subStyle && node.props.subStyle.color)) {
      fail(`no colour for the value under "${node.props.label}"`)
    }
  }
  for (const node of nodes(tree, 'Button')) {
    const style = node.props.style || {}
    if (!style.background || !style.color) fail(`no colours for the button "${node.props.label}"`)
  }
}

// All the plain text shown on a settings page, one string per Text node.
export const settingsText = (tree) => nodes(tree, 'Text').map((node) => node.children.join(''))
