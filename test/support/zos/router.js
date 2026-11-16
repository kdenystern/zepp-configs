import { world, pushPage, goBack } from '../world.mjs'

export const launchApp = (option) => world.launched.push({ ...option })
export const getAppIdByName = (name) => world.installedApps[name] || 0
export const push = ({ url, params }) => pushPage(url, params)
export const back = () => goBack()

// Every SYSTEM_APP_* constant in the Zepp OS docs. The values are made up;
// the real ones come from the firmware. They are `let` so setMissingSystemApps
// can blank some, imitating a firmware that lacks those apps: the page reads
// them through `import * as router`, which sees the live value.
export let SYSTEM_APP_STATUS = 1
export let SYSTEM_APP_HR = 2
export let SYSTEM_APP_SPORT = 3
export let SYSTEM_APP_WEATHER = 4
export let SYSTEM_APP_ALARM = 5
export let SYSTEM_APP_CAMERA = 6
export let SYSTEM_APP_MUSIC = 7
export let SYSTEM_APP_STOPWATCH = 8
export let SYSTEM_APP_COUNTDOWN = 9
export let SYSTEM_APP_FINE_PHONE = 10
export let SYSTEM_APP_CARD = 11
export let SYSTEM_APP_ALIPAY = 12
export let SYSTEM_APP_SETTING = 13
export let SYSTEM_APP_SPORT_HISTORY = 14
export let SYSTEM_APP_COMPASS = 15
export let SYSTEM_APP_PAI = 16
export let SYSTEM_APP_WORLD_CLOCK = 17
export let SYSTEM_APP_PRESSURE = 18
export let SYSTEM_APP_MENSTRUAL = 19
export let SYSTEM_APP_SPORT_STATUS = 20
export let SYSTEM_APP_CALENDAR = 21
export let SYSTEM_APP_SLEEP = 22
export let SYSTEM_APP_SPO2 = 23
export let SYSTEM_APP_PHONE = 24
export let SYSTEM_APP_NETEASE_MUSIC = 25
export let SYSTEM_APP_WEPAY = 26
export let SYSTEM_APP_BREATH = 27
export let SYSTEM_APP_POMODORO = 28
export let SYSTEM_APP_ALEAX = 29
export let SYSTEM_APP_THERMOMETER = 30
export let SYSTEM_APP_TODO_LIST = 31
export let SYSTEM_APP_ALTIMETER = 32
export let SYSTEM_APP_VOICE_MEMO = 33
export let SYSTEM_APP_SUN_AND_MOON = 34
export let SYSTEM_APP_MEASUREMENT = 35
export let SYSTEM_APP_ZEPP_COACH = 36
export let SYSTEM_APP_CLUB_CARD = 37
export let SYSTEM_APP_BODY_COMPOSITION = 38
export let SYSTEM_APP_READINESS = 39

const setters = {
  STATUS: (v) => (SYSTEM_APP_STATUS = v),
  HR: (v) => (SYSTEM_APP_HR = v),
  SPORT: (v) => (SYSTEM_APP_SPORT = v),
  WEATHER: (v) => (SYSTEM_APP_WEATHER = v),
  ALARM: (v) => (SYSTEM_APP_ALARM = v),
  CAMERA: (v) => (SYSTEM_APP_CAMERA = v),
  MUSIC: (v) => (SYSTEM_APP_MUSIC = v),
  STOPWATCH: (v) => (SYSTEM_APP_STOPWATCH = v),
  COUNTDOWN: (v) => (SYSTEM_APP_COUNTDOWN = v),
  FINE_PHONE: (v) => (SYSTEM_APP_FINE_PHONE = v),
  CARD: (v) => (SYSTEM_APP_CARD = v),
  ALIPAY: (v) => (SYSTEM_APP_ALIPAY = v),
  SETTING: (v) => (SYSTEM_APP_SETTING = v),
  SPORT_HISTORY: (v) => (SYSTEM_APP_SPORT_HISTORY = v),
  COMPASS: (v) => (SYSTEM_APP_COMPASS = v),
  PAI: (v) => (SYSTEM_APP_PAI = v),
  WORLD_CLOCK: (v) => (SYSTEM_APP_WORLD_CLOCK = v),
  PRESSURE: (v) => (SYSTEM_APP_PRESSURE = v),
  MENSTRUAL: (v) => (SYSTEM_APP_MENSTRUAL = v),
  SPORT_STATUS: (v) => (SYSTEM_APP_SPORT_STATUS = v),
  CALENDAR: (v) => (SYSTEM_APP_CALENDAR = v),
  SLEEP: (v) => (SYSTEM_APP_SLEEP = v),
  SPO2: (v) => (SYSTEM_APP_SPO2 = v),
  PHONE: (v) => (SYSTEM_APP_PHONE = v),
  NETEASE_MUSIC: (v) => (SYSTEM_APP_NETEASE_MUSIC = v),
  WEPAY: (v) => (SYSTEM_APP_WEPAY = v),
  BREATH: (v) => (SYSTEM_APP_BREATH = v),
  POMODORO: (v) => (SYSTEM_APP_POMODORO = v),
  ALEAX: (v) => (SYSTEM_APP_ALEAX = v),
  THERMOMETER: (v) => (SYSTEM_APP_THERMOMETER = v),
  TODO_LIST: (v) => (SYSTEM_APP_TODO_LIST = v),
  ALTIMETER: (v) => (SYSTEM_APP_ALTIMETER = v),
  VOICE_MEMO: (v) => (SYSTEM_APP_VOICE_MEMO = v),
  SUN_AND_MOON: (v) => (SYSTEM_APP_SUN_AND_MOON = v),
  MEASUREMENT: (v) => (SYSTEM_APP_MEASUREMENT = v),
  ZEPP_COACH: (v) => (SYSTEM_APP_ZEPP_COACH = v),
  CLUB_CARD: (v) => (SYSTEM_APP_CLUB_CARD = v),
  BODY_COMPOSITION: (v) => (SYSTEM_APP_BODY_COMPOSITION = v),
  READINESS: (v) => (SYSTEM_APP_READINESS = v),
}
const ids = Object.fromEntries(Object.keys(setters).map((suffix, i) => [suffix, i + 1]))

export const systemAppId = (suffix) => ids[suffix]

export function setMissingSystemApps(missing) {
  Object.keys(setters).forEach((suffix) =>
    setters[suffix](missing.includes(suffix) ? undefined : ids[suffix]),
  )
}
