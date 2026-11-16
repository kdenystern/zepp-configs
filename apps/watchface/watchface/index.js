// Launcher Face: big outlined time, date, battery, steps, heart rate, and a
// button in the bottom right corner that opens the Launcher app.
//
// Everything except the button is drawn and kept up to date by the firmware
// from image arrays; no timers or sensors run here.
import { createWidget, widget, align, data_type } from '@zos/ui'
import { getScene, SCENE_AOD } from '@zos/app'
import { getDeviceInfo } from '@zos/device'
import { launchApp } from '@zos/router'

import { LAUNCHER_APP_ID } from '../../../shared/config'
import { FACE, scaled } from './layout'

const digits = (prefix) => Array.from({ length: 10 }, (_, d) => `face/${prefix}${d}.png`)
const WEEK = Array.from({ length: 7 }, (_, i) => `face/week${i + 1}.png`)

WatchFace({
  onInit() {},

  build() {
    const { width } = getDeviceInfo()
    const s = scaled(width)
    const aod = getScene() === SCENE_AOD

    if (!aod) createWidget(widget.IMG, { x: 0, y: 0, src: 'face/bg.png' })

    createWidget(widget.IMG_TIME, {
      hour_zero: 1,
      hour_startX: s(FACE.hour.x),
      hour_startY: s(FACE.hour.y),
      hour_array: digits('h'),
      hour_space: 0,
      hour_align: align.LEFT,
      minute_zero: 1,
      minute_startX: s(FACE.minute.x),
      minute_startY: s(FACE.minute.y),
      minute_array: digits('m'),
      minute_space: 0,
      minute_align: align.LEFT,
    })

    // Always-on display: the outlined time only, which lights few pixels.
    if (aod) return

    createWidget(widget.IMG_WEEK, {
      x: s(FACE.week.x),
      y: s(FACE.week.y),
      week_en: WEEK,
      week_sc: WEEK,
      week_tc: WEEK,
    })
    createWidget(widget.IMG_DATE, {
      day_startX: s(FACE.day.x),
      day_startY: s(FACE.day.y),
      day_zero: 1,
      day_space: 0,
      day_align: align.LEFT,
      day_en_array: digits('d'),
      day_sc_array: digits('d'),
      day_tc_array: digits('d'),
    })

    createWidget(widget.ARC_PROGRESS, {
      center_x: s(FACE.ring.cx),
      center_y: s(FACE.ring.cy),
      radius: s(FACE.ring.r),
      start_angle: -90,
      end_angle: 270,
      line_width: FACE.ring.width,
      color: 0xc8ff3d,
      type: data_type.BATTERY,
    })
    createWidget(widget.TEXT_IMG, {
      x: s(FACE.battery.x),
      y: s(FACE.battery.y),
      w: s(FACE.battery.w),
      h: s(FACE.pct.h),
      type: data_type.BATTERY,
      font_array: digits('p'),
      h_space: -3,
      align_h: align.CENTER_H,
    })
    const number = (spot, type, alignH) =>
      createWidget(widget.TEXT_IMG, {
        x: s(spot.x),
        y: s(spot.y),
        w: s(spot.w),
        h: s(FACE.tiny.h),
        type,
        font_array: digits('t'),
        h_space: 0,
        align_h: alignH,
      })
    number(FACE.steps, data_type.STEP, align.LEFT)
    number(FACE.heart, data_type.HEART, align.LEFT)

    createWidget(widget.BUTTON, {
      x: s(FACE.launch.x),
      y: s(FACE.launch.y),
      w: -1, // take the size of the image
      h: -1,
      text: '',
      normal_src: 'face/launch.png',
      press_src: 'face/launch_p.png',
      click_func: () => {
        try {
          launchApp({ appId: LAUNCHER_APP_ID, url: 'page/index' })
        } catch (e) {
          console.log('face: could not open the launcher: ' + e)
        }
      },
    })
  },

  onDestroy() {},
})
