import { world } from '../world.mjs'

const names = (...list) => Object.fromEntries(list.map((name) => [name, name]))

export const widget = names(
  'TEXT', 'BUTTON', 'FILL_RECT', 'STROKE_RECT', 'IMG', 'ARC', 'GROUP', 'VIEW_CONTAINER',
  'IMG_TIME', 'IMG_WEEK', 'IMG_DATE', 'ARC_PROGRESS', 'TEXT_IMG', 'WIDGET_DELEGATE',
)
export const align = names('LEFT', 'RIGHT', 'CENTER_H', 'TOP', 'BOTTOM', 'CENTER_V')
export const text_style = names('NONE', 'WRAP', 'ELLIPSIS')
export const data_type = names('BATTERY', 'STEP', 'HEART')
export const event = names('CLICK_DOWN', 'CLICK_UP', 'MOVE')
export const prop = names('MORE', 'TEXT', 'VISIBLE', 'X', 'Y', 'W', 'H', 'COLOR')

// A VIEW_CONTAINER is a layer with widgets of its own, placed relative to it.
// They are listed in world.widgets like the rest, with `parent` set.
export const createWidget = (type, params) => make(type, params, null)

function make(type, params, parent) {
  if (!type) throw new Error('createWidget: unknown widget type')
  const w = {
    type,
    params: { ...params },
    parent,
    visible: true,
    listeners: {},
    addEventListener(name, callback) {
      if (!name) throw new Error('addEventListener: unknown event')
      w.listeners[name] = callback
    },
    setProperty(id, value) {
      if (id === prop.MORE) {
        // The docs: a BUTTON must be given all four of these every time.
        if (type === 'BUTTON' && ['x', 'y', 'w', 'h'].some((key) => !(key in value))) {
          throw new Error('setProperty: BUTTON needs x, y, w and h')
        }
        Object.assign(w.params, value)
      }
      else if (id === prop.VISIBLE) w.visible = !!value
      else if (id === prop.TEXT) w.params.text = value
      else if (id) w.params[id.toLowerCase()] = value
      else throw new Error('setProperty: unknown property')
    },
  }
  if (type === 'VIEW_CONTAINER') {
    if (parent) throw new Error('createWidget: a VIEW_CONTAINER inside another')
    w.createWidget = (childType, childParams) => make(childType, childParams, w)
  }
  world.widgets.push(w)
  return w
}

export function deleteWidget(w) {
  world.widgets = world.widgets.filter((other) => other !== w)
}

export function setStatusBarVisible(visible) {
  world.statusBarVisible = visible
}
