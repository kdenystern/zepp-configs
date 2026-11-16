// Drawing and launching tiles in the Launcher app.
import { createWidget, deleteWidget, widget } from '@zos/ui'
import * as router from '@zos/router'
import { showToast } from '@zos/interaction'

import { labelSize, darken } from './layout'

export function launch(tile) {
  if (tile.kind === 'system') {
    const appId = router['SYSTEM_APP_' + tile.id]
    if (appId === undefined) throw new Error('not available')
    router.launchApp({ appId, native: true })
  } else if (tile.kind === 'screen') {
    router.launchApp({ url: tile.url, native: true })
  } else {
    let appId = tile.appId
    if (tile.kind === 'name') {
      // getAppIdByName needs API level 3.6 and returns an invalid id on a miss.
      appId = router.getAppIdByName ? router.getAppIdByName(tile.name) : 0
      if (!(appId > 0)) throw new Error('not installed')
    }
    const option = { appId }
    if (tile.url) option.url = tile.url
    router.launchApp(option)
  }
}

function open(tile) {
  try {
    launch(tile)
  } catch (e) {
    showToast({ content: `Can't open ${tile.label}` })
  }
}

// Draws parsed tiles at the rects of a tileLayout and returns the widgets, for
// removeTiles. An icon tile is one image button, so the whole tile is
// tappable; a tile without an icon is a coloured button with its label.
export function drawTiles(tiles, layout) {
  return tiles.map((tile, i) => {
    const rect = layout.rects[i]
    if (tile.icon) {
      return createWidget(widget.BUTTON, {
        x: rect.x,
        y: rect.y,
        w: -1, // take the size of the image
        h: -1,
        text: '',
        normal_src: `icons/${tile.icon}.png`,
        press_src: `icons/${tile.icon}_p.png`,
        click_func: () => open(tile),
      })
    }
    return createWidget(widget.BUTTON, {
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      radius: layout.radius,
      normal_color: tile.color,
      press_color: darken(tile.color),
      color: 0xffffff,
      text_size: labelSize(tile.label),
      text: tile.label,
      click_func: () => open(tile),
    })
  })
}

export function removeTiles(widgets) {
  widgets.forEach((w) => deleteWidget(w))
}
