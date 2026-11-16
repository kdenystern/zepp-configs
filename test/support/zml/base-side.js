import { settingsStorage, sideCall, httpFetch } from '../world.mjs'

export const settingsLib = {
  getItem: (key) => settingsStorage.getItem(key),
  setItem: (key, value) => settingsStorage.setItem(key, value),
}

export const BaseSideService = (options) => ({
  ...options,
  call: (data) => sideCall(data),
  fetch: (options) => httpFetch(options),
})
