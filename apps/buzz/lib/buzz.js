// What the Buzz app can try: the motor's own patterns, and the vibrations a
// notification can ask for (`notify`'s `vibrate`). The notification names are
// the ones the Water app's settings page uses.
export const NOTIFICATION_BUZZES = [
  { name: 'Normal', value: 0 },
  { name: 'Gentle', value: 4 },
  { name: 'Buzz', value: 5 },
  { name: 'Beep', value: 1 },
  { name: 'Birdsong', value: 2 },
  { name: 'Drumbeat', value: 3 },
  // Not in the docs; the official notification sample uses it.
  { name: 'No. 6', value: 6 },
]

export const nameOf = (value) => {
  const found = NOTIFICATION_BUZZES.find((b) => b.value === Number(value))
  return found ? found.name : 'No. ' + value
}

const pad = (n) => (n < 10 ? '0' + n : '' + n)
// "09:05" from hours and minutes, the minutes allowed to run past 59.
export function clockLabel(h, m) {
  const total = (h * 60 + m) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
