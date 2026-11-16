// The Launcher app: a scrolling grid of app tiles, opened from the watch
// face's corner button. The tile list is edited on the phone.
import { createWidget, widget, align, prop, text_style, setStatusBarVisible } from '@zos/ui'
import { getDeviceInfo } from '@zos/device'
import { LocalStorage } from '@zos/storage'
import { BasePage } from '@zeppos/zml/base-page'

import { parseConfig, CONFIG_KEY, DEFAULT_CONFIG_TEXT } from '../../../shared/config'
import { tileLayout } from '../../../shared/layout'
import { drawTiles, removeTiles } from '../../../shared/tiles'

const storage = new LocalStorage()

Page(
  BasePage({
    state: {
      text: DEFAULT_CONFIG_TEXT,
      tiles: [],
      status: null,
      screen: null,
      statusText: '',
      tail: null,
      built: false,
    },

    onInit() {
      this.state.text = storage.getItem(CONFIG_KEY, DEFAULT_CONFIG_TEXT)
      this.pullConfig()
    },

    build() {
      setStatusBarVisible(false)
      const { width, height } = getDeviceInfo()
      this.state.screen = { width, height }
      const { header } = tileLayout(width, height)
      this.state.status = createWidget(widget.TEXT, {
        x: 60,
        y: 14,
        w: width - 120,
        h: header.h - 14,
        color: 0x9a9a9a,
        text_size: 20,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.WRAP,
        text: 'Checking phone...',
      })
      this.state.built = true
      this.render()
    },

    onDestroy() {
      this.state.built = false
      this.state.tiles = []
    },

    // Pushed by the phone when the config is edited while the launcher is open.
    onCall(data) {
      if (data && data.method === 'CONFIG') this.applyConfig(data.params && data.params.text)
    },

    // The stored copy keeps the launcher instant and usable without the phone.
    pullConfig() {
      try {
        this.request({ method: 'GET_CONFIG' })
          .then((result) => this.applyConfig(result && result.text))
          .catch(() => this.setStatus('Phone not reachable'))
      } catch (e) {
        console.log('launcher: config sync unavailable: ' + e)
        this.setStatus('Sync unavailable')
      }
    },

    applyConfig(text) {
      if (typeof text !== 'string') return
      if (text !== this.state.text) {
        this.state.text = text
        storage.setItem(CONFIG_KEY, text)
        if (this.state.built) this.render()
      }
      this.setStatus('Tiles synced')
    },

    // May be called before build() if the phone answers quickly.
    setStatus(text) {
      this.state.statusText = text
      if (this.state.built) this.showStatus()
    },

    showStatus() {
      const text = this.state.tiles.length === 0 ? 'No apps configured' : this.state.statusText || 'Checking phone...'
      this.state.status.setProperty(prop.TEXT, text)
    },

    render() {
      const { width, height } = this.state.screen
      const { tiles } = parseConfig(this.state.text)
      const layout = tileLayout(width, height, tiles.length)
      removeTiles(this.state.tiles)
      if (this.state.tail) removeTiles([this.state.tail])
      this.state.tiles = drawTiles(tiles, layout)
      // With more than three rows the page scrolls; an empty tail lets the
      // last row come up clear of the rounded screen corners.
      this.state.tail =
        layout.bottom > height
          ? createWidget(widget.TEXT, { x: 0, y: layout.bottom - 1, w: width, h: 1, text: '' })
          : null
      this.showStatus()
    },
  }),
)
