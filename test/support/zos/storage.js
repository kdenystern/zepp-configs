import { world } from '../world.mjs'

// Values go through JSON, like a file on the watch would.
export class LocalStorage {
  setItem(key, value) {
    world.files[key] = JSON.stringify(value)
  }
  getItem(key, defaultValue) {
    return key in world.files ? JSON.parse(world.files[key]) : defaultValue
  }
  removeItem(key) {
    delete world.files[key]
  }
  clear() {
    world.files = {}
  }
}
