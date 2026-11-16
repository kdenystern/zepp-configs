// A stand-in for the watch, the phone and the link between them, small enough
// to run the real page, side-service and settings code under Node.
//
// `registry` holds what the app code registers when its modules load (App,
// Page, ...). `world` is the mutable state tests inspect and tweak.

export const registry = { app: null, appId: 0, pages: {}, watchface: null, side: null, settingsPage: null, loading: null }

export const world = {}

export function resetWorld() {
  Object.assign(world, {
    screen: { width: 390, height: 450 },
    widgets: [],
    statusBarVisible: true,
    launched: [], // launchApp() calls
    toasts: [],
    files: {}, // LocalStorage contents; survives app restarts
    burned: 1830, // Calorie sensor reading, or null to make it throw
    now: new Date(2026, 10, 16, 12, 0, 0),
    installedApps: {}, // English name -> appId, for getAppIdByName
    scene: 'WATCHFACE', // or 'AOD' for the always-on display
    phoneConnected: true,
    messagingBroken: false, // request() throws synchronously
    settings: new Map(), // the phone's settingsStorage
    internet: null, // (url) => JSON body, or throws; null means the phone is offline
    bodyAsText: false, // fetch hands the body over as a string, as some phones do
    fetched: [], // URLs the side service asked for
    appInstance: null,
    stack: [], // [{ url, params }]
    page: null, // instance of the page on top of the stack
    side: null, // running side service, if any
  })
}
resetWorld()

// --- settingsStorage, shared by the side service and the settings page ---

export const settingsStorage = {
  getItem: (key) => world.settings.get(key),
  setItem(key, value) {
    const oldValue = world.settings.get(key)
    world.settings.set(key, value)
    if (world.side && world.side.onSettingsChange) {
      world.side.onSettingsChange({ key, newValue: value, oldValue })
    }
  },
  toObject: () => Object.fromEntries(world.settings),
}

// --- app and page lifecycle ---

function instantiate() {
  const top = world.stack[world.stack.length - 1]
  const definition = registry.pages[top.url]
  if (!definition) throw new Error(`no such page: ${top.url}`)
  // Each page load starts from the state declared in the page definition.
  const page = { ...definition, state: structuredClone(definition.state || {}) }
  world.widgets = []
  world.statusBarVisible = true
  world.page = page
  if (page.onInit) page.onInit(top.params)
  if (page.build) page.build()
  return page
}

function destroyPage() {
  if (world.page && world.page.onDestroy) world.page.onDestroy()
  world.page = null
}

// router.push hands params over as a string, JSON for objects.
const wire = (params) => (params !== null && typeof params === 'object' ? JSON.stringify(params) : params)

export function startApp(url) {
  world.appInstance = { _options: { ...registry.app, globalData: {} } }
  if (registry.app.onCreate) registry.app.onCreate.call(world.appInstance._options)
  world.side = registry.side ? { ...registry.side } : null
  if (world.side && world.side.onInit) world.side.onInit()
  world.stack = [{ url, params: undefined }]
  return instantiate()
}

// A watch face is built once and then paused and resumed by the system.
export function startWatchface() {
  world.appInstance = { _options: { ...registry.app, globalData: {} } }
  world.widgets = []
  const face = { ...registry.watchface }
  world.page = face
  if (face.onInit) face.onInit()
  face.build()
  return face
}

export function resumeWatchface() {
  world.widgets.filter((w) => w.type === 'WIDGET_DELEGATE').forEach((w) => w.params.resume_call())
}

export function closeApp() {
  destroyPage()
  world.stack = []
  world.appInstance = null
}

export function pushPage(url, params) {
  destroyPage()
  world.stack.push({ url, params: wire(params) })
  return instantiate()
}

// Going back rebuilds the previous page from scratch, as the watch does.
export function goBack() {
  destroyPage()
  world.stack.pop()
  return world.stack.length ? instantiate() : null
}

// --- the BLE link between page and side service ---

const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

export function pageRequest(data) {
  if (world.messagingBroken) throw new TypeError('onMessage is not a function')
  return new Promise((resolve, reject) => {
    if (!world.phoneConnected || !world.side) {
      reject(new Error('shake timeout'))
      return
    }
    world.side.onRequest(copy(data), (error, result) => {
      if (error) reject(error)
      else resolve(copy(result))
    })
  })
}

export function sideCall(data) {
  if (world.phoneConnected && world.page && world.page.onCall) world.page.onCall(copy(data))
}

// --- the phone's internet, for the side service's fetch ---

export function httpFetch(options) {
  const url = typeof options === 'string' ? options : options.url
  world.fetched.push(url)
  return new Promise((resolve, reject) => {
    if (!world.internet) {
      reject(new Error('network request failed'))
      return
    }
    const body = world.internet(url)
    resolve({ status: 200, body: world.bodyAsText ? JSON.stringify(body) : copy(body) })
  })
}

// The phone's clock follows the mock world, like the watch's Time sensor.
Date.now = () => world.now.getTime()

// --- globals the Zepp runtimes provide ---

globalThis.App = (options) => {
  registry.app = options
}
globalThis.getApp = () => world.appInstance
globalThis.Page = (options) => {
  registry.pages[registry.loading] = options
}
globalThis.WatchFace = (options) => {
  registry.watchface = options
}
globalThis.AppSideService = (options) => {
  registry.side = options
}
globalThis.AppSettingsPage = (options) => {
  registry.settingsPage = options
}
// Settings-page components just describe themselves, so tests can walk the
// tree, read the text and fire the callbacks.
for (const type of ['View', 'Section', 'Text', 'TextInput', 'Button', 'Toggle', 'Select', 'Link']) {
  globalThis[type] = (props, children) => ({
    type,
    props: props || {},
    children: children === undefined ? [] : [].concat(children),
  })
}
