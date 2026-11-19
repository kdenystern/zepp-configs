import { world } from '../world.mjs'

export function notify(option) {
  if (!option || !option.title || !option.content || !Array.isArray(option.actions)) {
    throw new Error('notify: title, content and actions are required')
  }
  world.notifications.push(option)
  return world.notifications.length
}
