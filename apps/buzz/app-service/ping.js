// Woken by the alarm the page's "In 1 min" button sets: buzzes the motor's
// strong reminder pattern ("4 times"), exactly the way the Water app's
// reminder does, with no notification.
import { Vibrator, VIBRATOR_SCENE_STRONG_REMINDER } from '@zos/sensor'

AppService({
  onInit() {
    try {
      const vibrator = new Vibrator()
      vibrator.stop()
      vibrator.setMode(VIBRATOR_SCENE_STRONG_REMINDER)
      vibrator.start()
    } catch (e) {
      console.log('buzz: vibrator failed: ' + e)
    }
  },
  onDestroy() {},
})
