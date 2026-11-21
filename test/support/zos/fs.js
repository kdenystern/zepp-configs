import { world } from '../world.mjs'

// The app's /data folder: world.dataFiles maps a path to its text. As the
// docs say, an App Service may write only while the screen is off:
// world.screenOn makes its writes throw.
export function readFileSync({ path, options } = {}) {
  if (!(path in world.dataFiles)) return undefined
  const text = world.dataFiles[path]
  return options && options.encoding ? text : new TextEncoder().encode(text).buffer
}

export function writeFileSync({ path, data } = {}) {
  if (world.inService && world.screenOn) throw new Error('file writes need the screen off')
  if (typeof data !== 'string') throw new Error('the mock only stores text')
  world.dataFiles[path] = data
}

export function statSync({ path } = {}) {
  return path in world.dataFiles ? { size: world.dataFiles[path].length } : undefined
}

export function rmSync({ path } = {}) {
  delete world.dataFiles[path]
}
