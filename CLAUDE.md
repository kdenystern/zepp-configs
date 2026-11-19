# Working notes for this repo

Zepp OS watch face and mini apps for the user's **Amazfit Cheetah (Square)** (not the
Pro, not the round one). Sideloaded only: the user does not want the Zepp app store,
and does want the source on GitHub. `README.md` is for people; this file is what a new
session needs to know.

## Start here

- `npm test` must stay green. It is the only feedback loop on this machine: headless,
  no Zepp simulator, no watch attached.
- After changing icons, artwork, layout or screens: `npm run icons` (if images changed),
  `npm run screens`, then look at `docs/*.png` with the Read tool.
- `npm run build` proves the Zeus toolchain accepts the code. It needs no login.
- Only the user can install on the watch (`npm run qr:<app>`, their Zepp login and
  phone). **Every install is manual work for them.** Do not ship guess-and-check builds;
  ask what can be checked without installing, and batch changes into one install.
- Mocks only imitate what the docs say. A passing test is not proof on hardware; say so.
- Published as the public repo `github.com/kdenystern/zepp-configs` (branch `main`,
  remote `origin`). Commit and push only when asked. This machine stores no GitHub
  credentials (no `gh`, no SSH key): a push needs a token from the user each time.
  Commits use the account's GitHub noreply address (set in the repo's git config) so
  no personal email is published. Licence: MIT (`LICENSE`).
- README (user, 2026-11-19): screenshots in rows of three, not one long row; test
  tools such as Buzz are left out of it.
- **README rules (user, 2026-11-16).** It is for human readers: short, plain and
  level-headed. No verification status, no caveats about what is or is not proven, no
  explanations of platform limits the user already knows, nothing apologetic or
  promotional. It carries a notice that the repo was written by AI models, "Claude Fable and Claude
  Opus", without version numbers (user, 2026-11-19: models change, and the commit dates
  show which was current); keep it. Anything meant for an AI session (what is confirmed on hardware, toolchain
  traps, API facts) goes in this file, not the README.
- Keep this file current at the end of a piece of work (the user asked for that).

## What exists

| Path | What | App id |
| --- | --- | --- |
| `apps/watchface` | Launcher Face: thin-line watch face with a launcher button bottom right | 68233 |
| `apps/launcher` | Launcher app: scrolling grid of app tiles, configured from the phone | 68231 |
| `apps/nutrition` | Calorie and protein tracker | 68232 |
| `apps/weather` | Weather: today (or tomorrow) hour by hour on one screen | 68234 |
| `apps/tasks` | Tasks: today's to-do list, one-off and repeating, checked off on the watch | 68235 |
| `apps/water` | Water: a level that drains over an adjustable wait, tap the drop to refill, buzz when dry | 68236 |
| `apps/buzz` | Buzz: a test bench for vibrations (motor, notification, alarm) | 68237 |
| `shared/` | `config.js` (text config parser), `layout.js` (tile grid), `icons.js` (icon table), `tiles.js` (draw and launch tiles), `settings-ui.js` (the dark look of every settings page) | |
| `test/support/` | Mock watch, phone, BLE link and internet | |
| `test/fixtures/` | Real Open-Meteo forecast and ensemble answers (Helsinki, same days), used by weather tests and previews | |
| `tools/` | `make-icons.mjs`, `preview.mjs`, `settings-html.mjs`, `sharp.mjs` | |

The app ids are arbitrary sideload ids. `68231` is `LAUNCHER_APP_ID` in
`shared/config.js` (the watch face button opens it) and `68232` appears in the default
tile config.

**Flow.** Watch face → corner button → Launcher app → tap a tile → app. The tile list
is text in the Launcher's settings page in the Zepp app; the Launcher's side service
serves it over BLE (ZML) when the Launcher opens, and the page keeps a copy in
`LocalStorage` so it works without the phone.

**Watch face.** No JS runs after `build()`: the firmware updates `IMG_TIME`, `IMG_WEEK`,
`IMG_DATE`, `ARC_PROGRESS` and `TEXT_IMG` from image arrays and a `data_type`. Positions
live in `apps/watchface/watchface/layout.js`, which `tools/make-icons.mjs` also draws
from. The always-on display (`SCENE_AOD`) gets the time only.

**Weather.** One page. Header chip (a `BUTTON`: place and day, tap flips today/tomorrow),
current conditions, then three charts on one 24-hour axis: temperature line, rain/snow
bars, wind line with gust dashes. 13 px an hour, plot from x 39 to 351. The rain chart
is the big one in the middle (user, 2026-11-17: temperature barely moves over a day,
rain matters):
- Bars: rain expected per hour (mm), from 0 to a round amount (1, 2, 5... mm,
  `rainScale`) marked in the **right** margin in the bar colour; at least 4 px, none
  under `TRACE` (0.05 mm); past hours dimmed to 60%.
- Over them, the chance of rain per hour as a 2 px step line (`stepRects`), its 0% and
  100% marked in the **left** margin in the line's colour. The user insisted the left
  scale be 0% to 100% (a "0 to 2" there confused them). A "%" label above each hour
  where rain becomes likely from now on (`chanceMarks`: on at 50%, off below 30%).
- Caption: today it is the current hour ("Now 0.3 mm/h, 84%"), not the day total,
  which the user does not care about; tomorrow it is "Total 6.7 mm, up to 100%".
- **Rain and chance come from the Open-Meteo ensemble API**, not the forecast API
  (user complaint 2026-11-17: hours with rain and no bar). The forecast's
  `precipitation` is one model run and its `precipitation_probability` comes from
  other ensembles, so they disagree: the Helsinki fixture has 0.0 mm at 82-100% for
  five hours. The side service fetches both in parallel; `readEnsemble` turns the 40
  `icon_seamless` runs into the average amount and the share of runs with at least
  0.1 mm, matched to the forecast's hours by timestamp. Without the ensemble (failed
  fetch, or an hour most runs lack) the forecast's own figures are used. The charts are built **only from `FILL_RECT`s**
(`lib/chart.js` turns data into rectangles; a "line" is 3 px columns, merged where
flat), because that is the drawing primitive already proven on the watch and the mock
preview draws it exactly. `CANVAS` (API 3.0) and `GRADKIENT_POLYLINE` exist in the docs
but were deliberately not used: unseen on this watch. Roughly 50 to 200 widgets a
screen. The phone's side service does all the network work against Open-Meteo (free,
no key): geocoding for the settings page's search box, and the forecast on the watch's
`GET_WEATHER` request, shrunk to 49 hourly values per series (`lib/forecast.js`). The
watch stores that in `LocalStorage` and draws it before the phone answers. Units are
applied by the API, not converted on the watch. The app is not in the Launcher's
default tiles: the user adds `Weather = app:68234:page/index @weather` on the phone.

**Tasks.** Built 2026-11-16 because the user finds the built-in to-do app poor. Scope
they set: daily tasks and quick reminders only (projects live in Notion, events in
Google Calendar), one-off and repeating, stored on the phone for good, today's undone
tasks shown, a checked task disappears, Undo at the bottom. All the logic is in
`lib/tasks.js` (pure). Design decisions, all mine unless noted:
- A task is `{ id, title, repeat, due, done }`. It shows from `due` until checked off
  (it carries over, shown once). A repeat counts **from the day it was done**
  (`{days}`, `{months}`) or is the next listed weekday (`{on}`).
- The database is settings storage key `tasks` (`{ next, tasks }`); finished one-offs
  are kept in it for good and never sent to the watch. Tasks are typed into the
  settings page as text ("Workout every 3 days"); `parseTask` reads the repeat off the
  end. Text entry on the watch was left out: the `KEYBOARD` widget is documented from
  API 3.0 but unseen on this watch.
- The watch keeps `{ base, changes, undo }` in `LocalStorage` key `state`: the phone's
  list, its own unconfirmed checks (full tasks keyed by id), and today's undo stack.
  `SYNC` sends `{ id: { due, done } }` and gets the active list back; changes are
  dropped only when the answer covers them, so a lost answer costs nothing. One request
  at a time. The phone keeps a separate undo stack (key `undo`) for its own Done buttons.
- The list's day changes at 04:00 (`DAY_STARTS_AT`), on the watch and the phone alike.
- Watch drawing: per row a `TEXT` (wrap) under an image `BUTTON` (`row.png` is
  see-through with the ring and rule; `row_p.png` is the pressed look), the same
  image-button kind as the Launcher tiles. Rows are made once and reused: after a tap
  the titles are rewritten with `prop.TEXT` and spare rows hidden with `prop.VISIBLE`.
  `deleteWidget` and `SCROLL_LIST` were avoided as unseen here. Five tasks fit one
  screen; more scroll.
- Undo is pinned to the bottom of the screen (user, 2026-11-17: it moving up and down
  under the list was annoying; it should sit above the tasks when they overflow). The
  page is two `VIEW_CONTAINER`s, exactly the arrangement of the docs' own sample
  (`showcase/page/ui/widget/view_container.js`, whose animation shows the button
  standing still while the list moves): the list in a full-screen one that scrolls, and
  a 68 px strip at the bottom with `z_index: 1, scroll_enable: 0` holding a black
  `FILL_RECT` and the Undo `BUTTON`. Both are hidden with `prop.VISIBLE` when there is
  nothing to undo. `modal` is left at its default, as in the sample. A list longer than
  five rows gets a black `FILL_RECT` after its end so the last row scrolls clear of the
  strip. The page itself never scrolls.
- Not in the Launcher's default tiles: the user adds `Tasks = app:68235:page/index @todo`.

**Water.** Built 2026-11-18 (by Claude Opus 5.5). The user does not feel thirst
reliably and wants only a safety net for the worst case: "make it buzz if it wasn't
opened after 3 hours, the whole app being just one button to confirm I have drunk
something" (2026-11-18, after rejecting a first version with a goal, drink sizes, a
timeline and Undo as "too much thinking"). Keep it that small. The second version, a
big blue "Drank" button with times above and below, they rejected as embarrassing to
use in front of people: "make it normal", **no text or numbers**. Then (same day) they
asked for the wait to be adjustable instead of fixed wake/bed times, and for the app to
use their **actual** sleep from the watch. On 2026-11-19 they corrected the sleep rule:
"if I am sleeping the time shouldn't go up at all, not skip buzzing" (the level must
stand still in the night, not refill at waking), and said they **did not notice the
buzz at all** on the first install (vibrate 4 "gentle"), so Buzz was built to find one
they feel. Later on 2026-11-19, after trying Buzz: unread notifications (two or more)
seem to **silence vibrations**, so Water must **not send a notification, only buzz**;
the "4 times" button (`VIBRATOR_SCENE_STRONG_REMINDER`, which they felt as repeated
buzzing) is exactly the signal they want; time **off the wrist** must not count either;
the wait should be finer (they want 2 h 45 min). Design:
- Watch page: a full-width blue `FILL_RECT` from the bottom whose height is the share of
  the wait left (`levelAt`). A thin-line Phosphor drop (`drop.png`, 150 px,
  `drop_p.png` filled while pressed) is an image `BUTTON` in the middle; at zero a red
  copy (`drop_red*.png`) is shown instead via `prop.VISIBLE`. Tapping either stores the
  time in `LocalStorage` key `last` and refills. A global `setInterval` redraws every
  20 s while open (cleared in `onDestroy`; global timers are documented for pages but
  not yet used on this watch). Opening the app without tapping only settles a stored
  off-wrist time (below).
- Only **time awake** counts (`awakeSince`): from the last tap to now, minus the
  overlap with the night from the `Sleep` sensor (`readSleep` in `lib/watch.js`,
  permission `data:user.hd.sleep`, turned into `{ start, end }` by `sleepSpan`). Awake:
  `getInfo()`'s `startTime`/`endTime` (minutes after local midnight), the night that
  ended within the last day. Asleep (`getSleepingStatus() === 1`): from the latest
  `startTime` until now, which assumes `getInfo()` reports the night in progress or a
  similar bedtime (unknown). Only one night is subtracted. `updateInfo()` is called on
  open and in the service; the page re-reads every 5 min while open. Without sleep data
  all the time counts. The very first open stores a tap so it starts full.
- **Off the wrist** (`Wear` sensor, `getStatus()`: 0 off, 1 worn, 2 moving, 3 unsure):
  app.json has `"app-event": { "path": "app-service/remind" }` and the permissions
  `event:os.health.wear_status` and `event:os.health.sleep_status`, so the system
  wakes the service on those changes (docs: guides/framework/device/system-event).
  Seen off: the service stores the moment in `LocalStorage` key `off`. Seen on (by the
  service, or by the page opening): `liftOff` moves `last` on by the time off and
  clears `off`. Without the events, the alarm checks notice it (every 30 min while
  paused). Service writes are allowed with the screen off, per the docs.
- Reminders: whenever the page opens or the drop is tapped, `plan()` cancels all of the
  app's alarms (`getAllAlarms`) and sets one-shot `@zos/alarm`s (`store: true`, given
  both `time` and `date` because the docs and the official notification sample
  disagree on the name, plus `repeat_type: REPEAT_ONCE`): the first when the wait runs
  out if you stay awake (or half an hour on while paused: asleep or off the wrist, or
  a whole wait on once already due), then every `gap` up to 48 h / 24 alarms as a
  fallback. Each alarm wakes the App Service `app-service/remind`, which buzzes only if
  `shouldBuzz` (not paused, and at least `gap` minus 5 min counted since the tap) and
  re-plans from its own state. If nothing can be read, it buzzes.
- The buzz: `buzz()` in `lib/watch.js`, `Vibrator` `stop()`, `setMode(
  VIBRATOR_SCENE_STRONG_REMINDER)`, `start()`, the same calls as Buzz's "4 times".
  **No notification** (and no `device:os.notification` permission). Earlier builds
  sent one, first with an "Open" action pointing at `page/index` (the docs say an
  action's `file` must be an App Service), then "Drank"; the user disliked that name
  and the notification is gone. Unknown: whether the vibration outlives the service's
  600 ms, and whether it ever stops by itself (from a page it buzzes until the app
  closes, see Buzz below).
- Docs-based worries, all unseen on hardware: App Service single runs get 600 ms; the
  docs' API table for services does not list `@zos/alarm` or `@zos/storage` (both are
  wrapped in `try`), and says file writes work only with the screen off. How quickly `getSleepingStatus()` and
  `endTime` follow real waking is unknown. Local time comes from the `Time` sensor via
  `clockOffset()` (wall clock minus UTC, rounded to 15 min).
- Settings page: "Remind after", with − and + pill `Button`s, 30 min to 6 h in 15 min
  steps, default 3 h (no `TextInput`, because of the white pop-up the user hates).
  Settings storage key `gap` (minutes as a string); the side service hands it over on
  `SETTINGS` and pushes it on change. (A vibration choice existed briefly; removed with
  the notification.)
- Not in the Launcher's default tiles: the user adds `Water = app:68236:page/index @water`.

**Buzz.** Built 2026-11-19 (by Claude Opus 5.5) because the user felt nothing from
Water's first buzz. One screen, no scrolling, labelled buttons (a test tool, so text is
fine): six `Vibrator` patterns (`setMode(n)` then `start()`, as the official t9-keyboard
sample does; a constant missing on the firmware shows "not on this watch"), seven
`notify()` vibrations (the six documented plus 6, which the official notification
sample uses), and "In 1 min", which sets an alarm (`time` and `date`, `store: true`) for
`app-service/ping` to buzz "4 times" with no notification, exactly Water's path. The
first build's "In 1 min" sent a notification from the alarm and never arrived for the
user (2026-11-19); maybe unread notifications silenced it, maybe the alarm never fired.
They did not retest. The status line shows the
result (`notify`'s id 0 = not sent, `set`'s id 0 = alarm not set). No phone side or
settings page; the harness now allows apps without them. Tile:
`Buzz = app:68237:page/index @buzz`. What the user reports from it decides Water's
default vibration and whether alarms and services work at all.
- Mocks: `test/support/zos/alarm.js`, `notification.js`, `Sleep`, `Wear` and `Vibrator`
  in `sensor.js` (`world.sleep`, `world.sleepBroken`, `world.worn`, `world.vibrations`), the `AppService` global and `fireAlarm()` in the
  harness (moves `world.now` to the alarm and runs the service).

**Launcher.** Any number of tiles up to 60, three square tiles per row; the first nine
fill one screen under a status line, more rows scroll. Icon tiles are single image
buttons (`normal_src`/`press_src`, `w: -1, h: -1`).

## Known limitation: returning from a custom app freezes the watch face

On the Cheetah (Square), Zepp OS 3.5: if a JS mini app is opened **from the watch face**
and then closed back to it, the watch face stops receiving input. Buttons still play
their press animation but `click_func` is never called, and timers created by the watch
face stop. It recovers the next time the watch face is re-entered from a system screen:
screen off and on, or a visit to notifications and back. Built-in apps opened from the
watch face do not cause it.

It was seen with the Nutrition app and not with the Launcher app, and how the app is
left (swipe or button) makes no difference. Nothing done inside the watch face or the
Nutrition app fixed it. Treat it as a firmware bug to design around:

- The watch face has exactly one tappable thing, the Launcher button. Do not put app
  tiles on the watch face.
- All app launching happens in the Launcher app, which does not freeze.
- If the Launcher button itself is ever reported dead after returning from an app,
  this is why; a screen off/on restores it.

## Confirmed on the real watch (user reports, 2026-11-16)

- `zeus login --no-browser` plus pasting the callback URL; QR install via Developer Mode.
- Launcher app: draws, launches apps, "works well", never freezes.
- A watch face built here loads; `IMG_TIME`/`IMG_WEEK`/`IMG_DATE`, image `BUTTON`s with
  `click_func`, `launchApp` (built-in and mini apps) and `WIDGET_DELEGATE.resume_call`
  all work on a watch face. `@zos/timer` works there too.
- `addEventListener` on a `TEXT` widget does **not** fire on a watch face.
- The Nutrition app runs.
- Physical buttons cannot reach custom apps (workout button fixed, lower button is
  sleep), which is why launching goes through the watch face.
- About 2 GB free on the watch; asset size is not a concern.
- Tasks (user, 2026-11-17, on the first build): "The todo app is good". They saw Undo
  move up and down under the list and the add box on the phone as plain text, so that
  build's rows, check-off, Undo, `prop.VISIBLE` and `prop.MORE` on a `BUTTON`, the sync
  and the settings page all ran. They did not report on the pieces one by one (wrapped
  titles, a list longer than a screen), and the page has been rebuilt on
  `VIEW_CONTAINER`s since, see below.
- User, 2026-11-17, after installing the rebuilt Tasks: Undo stays at the bottom (so the
  two-`VIEW_CONTAINER` arrangement works on this watch), and they like the dark settings
  style (so `View`/`Text`/`Button` styles and the white Add pill render). The pop-up where a `TextInput` value is
  typed is all white and they hate it ("flashbanged"); `TextInput` documents no prop
  that styles it, and there is no inline input component.

## Not yet confirmed on the watch

- The current watch face design as a whole, in particular `ARC_PROGRESS` and `TEXT_IMG`
  with `type: data_type.X` (documented for watch faces, not yet seen on this watch),
  the hours-over-minutes `IMG_TIME`, and the always-on display.
- Launcher scrolling with more than nine tiles.
- Whether phone config sync works (the user has not said), and `name:` / `screen:`
  targets.
- The Weather app: the user has installed it and runs it (2026-11-17, complaining that
  the rain chart had hours with rain but no bar, and no chance shown through the day).
  So the side service's `fetch` to Open-Meteo works. The ensemble request and the
  redesigned rain chart are unseen on the phone and watch. Not reported on: whether the side
  service is started by a settings change while the watch app is closed (ZML has code
  for it; if not, the watch's first request does the place lookup instead),
  `Time.getTime()`, and how wide the texts come out in the watch's own font (the
  page avoids characters beyond `°` on purpose).

- Water: the first build was installed 2026-11-18 and the user noticed no buzz
  (2026-11-19). Unseen: **alarms waking an App Service at all** (Buzz's "In 1 min" never
  arrived), the `Vibrator` from a service, the system events and `Wear`, the service
  reading and writing `LocalStorage` and setting alarms, the `Sleep` sensor (especially
  `startTime` while asleep), and how many persistent alarms one app may hold (up to 24).
- Buzz (user, 2026-11-19): the motor buttons work from a page. "4 times"
  (`setMode(VIBRATOR_SCENE_STRONG_REMINDER)` then `start()`) **buzzes continuously
  until the app is closed**, not four times; the user wants exactly that as Water's
  signal and notes it is a way to get a continuous buzz. From a single-run App Service
  (600 ms) it is unknown whether it stops when the service exits or keeps going; there
  is no timer in a service to `stop()` it. Ask the user after the first real reminder. Notifications from a page arrive (unread ones then silence vibrations).
  The alarm path is unconfirmed.
- Tasks, the parts nobody has reported on: a list longer than five rows scrolling under
  the pinned Undo (the black `FILL_RECT` past the last row is meant to lengthen the
  scroll; if the list will not scroll with Undo showing, suspect the strip's default
  `modal: 1`), and titles wrapping to two lines.
- The dark settings pages of Launcher, Nutrition and Weather (same shared style as
  Tasks, which the user has seen; whether they installed these three is not known), and
  Weather's unit pills in place of `Select`.

## User preferences

- Watch settings, vibration "Enhanced": makes buzzes noticeable for the user (they
  report, 2026-11-19). In the watch's button-shortcut settings every custom app shows
  as "NULL" (README known issue).
- Nutrition: the user only looks at today. They know Zepp's own calorie tracking cannot
  be written to and do not want it explained again. (The app still syncs day totals to
  the phone: 30 days kept on the watch, 180 in the settings page.)
- Square tiles; icons, not text. Flat colours and **thin lines**: gradients and heavy
  fills look bad on this low-resolution screen.
- Settings pages: dark, matching the Zepp app's dark grey look (asked 2026-11-17 with a
  screenshot of it; colours in `shared/settings-ui.js` were sampled from that). A thing
  to tap must look like a button, not like text among other text.
- On the watch, controls should stay where they are: a button that moves as the content
  changes is annoying.
- The launcher button belongs in the bottom right corner, for reach.
- They plan to build more custom apps, so the Launcher must take any number of tiles.
- Calorie/protein sync into Zepp's own tracking was wanted; it is impossible (below)
  and has been explained. Do not retry without new evidence of an API.

## Zepp OS facts worth not re-deriving

**Device.** Cheetah (Square): `deviceSource` 8257793, 390×450, corner radius 86, latest
API_LEVEL 3.6 (Zepp OS 3.5), CPU platform NXP, no SecondaryWidget support. A target with
`"platforms": [{ "st": "s", "dw": 390 }]` builds for every square screen and includes it.

**Docs.** Web search of docs.zepp.com returns pages without their tables. Clone only
the text: `git clone --depth 1 --filter=blob:none --sparse
https://github.com/zepp-health/zeppos-docs.git`, then `git sparse-checkout set
docs/reference docs/guides` (add `docs/watchface` if needed). That is about 3 MB instead
of 430 MB; still delete it afterwards (`/tmp` is RAM here). Single pages can also be
fetched from `raw.githubusercontent.com/zepp-health/zeppos-docs/main/docs/<path>.mdx`.
`zeppos-samples` has official examples per API level; `zepp-health/zml` is the
messaging library source.

**Toolchain.**
- Zeus CLI is a devDependency; always run it from the repo (`npx zeus …` or the npm
  scripts). From another folder `npx` fetches an unrelated copy that exits silently.
- `zeus create` prompts even with flags. Its templates are in
  `node_modules/@zeppos/zeus-cli/private-modules/zeppos-app-utils/dist/public/template/`.
- `zeus build` → `dist/*.zab`: a zip of per-platform `.zpk`s (each `device.zip` +
  `app-side.zip`) plus `.ip-package` holding the pre-bytecode JS, handy for inspecting
  what the bundler did. Device code ends up as QuickJS bytecode.
- The bundler resolves relative imports **outside the app folder** (`../../../shared/x`)
  and extensionless imports.
- `@zos/*` imports become run-time `__$$R$$__('@zos/…')` lookups, so a constant missing
  on a firmware reads as `undefined` instead of failing to link.
- PNGs are converted and auto-scaled per screen from `designWidth`.
- Each page is its own bundle: module variables are **not** shared between pages. Use
  `getApp()._options.globalData` (see `apps/nutrition/lib/session.js`).
- Pages have only `onInit(params)`, `build`, `onDestroy`; going back rebuilds the
  previous page. `push` params arrive as a JSON string.
- Permissions used: `device:os.local_storage`, `data:os.device.info` (for
  `getDeviceInfo`). A missing one throws at run time.

**Launching apps.** `launchApp({ appId: SYSTEM_APP_X, native: true })` for built-in apps
(39 constants, API 3.0), `launchApp({ appId, url })` for mini apps,
`launchApp({ url: 'SomeScreen', native: true })` for internal screen names,
`getAppIdByName(name)` from API 3.6. There is no API to list installed apps.

**Phone side.** Settings page: `AppSettingsPage({ build(props) })` with `View`,
`Section`, `Text`, `TextInput` (`multiline`, `rows`), `Button`; state in
`props.settingsStorage`. Every page here is built from `shared/settings-ui.js`
(`page`, `card`, `text`, `note`, `field`, `button`, `addButton`, `choice`, `row`), which
gives each component its colours: dark page, grey cards, white pill for what is chosen.
`Section` and `Select` are not used because their text colours cannot be set (`Section`
takes one `style`, `Select` none); `choice` is a row of pill `Button`s instead. A test
per app (`assertDark`) fails if a text, input or button is left without a colour.
`TextInput` documents `labelStyle` and `subStyle`; the official `todo-list` sample makes
its add button by wrapping a label-only `TextInput` in a styled `View`. ZML (`@zeppos/zml` 0.0.43) gives `this.request`/`onRequest`
and `this.call`/`onCall` both ways plus `onSettingsChange` on the side service, which
must be defined. ZML from 0.0.28 needs API 3.6, so every `this.request` on the watch is
wrapped in `try`/`catch` and both apps work from local storage when sync fails.

**Internet.** Only the side service has it. `this.fetch({ url, method })` in a ZML
`BaseSideService` is the global `fetch` with a 10 s timeout; it resolves to
`{ status, body }` where `body` is parsed JSON on some phones and a JSON string on
others. No permission is needed for it. ZML's watch-side `this.request` waits up to
60 s. Settings storage is the only channel between the settings page and the side
service: a `setItem` on either side fires the service's `onSettingsChange` and redraws
the settings page. Neither the phone nor the side service exposes the phone's location;
the watch has a `Geolocation` sensor (GPS, slow), unused here.

**Open-Meteo ensemble.** `ensemble-api.open-meteo.com/v1/ensemble`, same place, time
and unit parameters as the forecast. `hourly=precipitation` returns the control run as
`precipitation` and the rest as `precipitation_member01`..`39` for `icon_seamless` (40
runs, about 35 KB for 3 days of rain and snow). ICON is hourly for the first two days,
then 3-hourly; GFS (`gfs025`) and ECMWF (`ecmwf_ifs025`) ensembles are 3-hourly
throughout. Inches come with three decimals. `start_date`/`end_date` reach back a few
days, which is how the fixture matches the forecast fixture's days.

**Open-Meteo.** `timezone=auto&timeformat=unixtime` makes `hourly.time[0]` the place's
local midnight as a UTC timestamp, with `utc_offset_seconds` alongside. Hourly
temperature and wind are readings at the full hour; precipitation, snowfall, gusts and
precipitation probability are for the hour *ending* at that time. Snowfall is depth in
cm (or inches with `precipitation_unit=inch`), about 7 times its water equivalent. A
geocoding miss returns a body with no `results` key. Attribution (CC BY 4.0) is in the
settings page and the README.

**Watch faces.** `appType: "watchface"`, `module.watchface { path, main, editable,
lockscreen }`, `app.icon` is the preview image (266×307 for this watch), code is
`WatchFace({ onInit, build, onDestroy })`. `@zos/*` modules work there. A watch face has
no settings page or side service. Cross-app data exists (`ShareLocalStorage` in
`@zos/storage`, read with `@zos/share-storage`) but is unused here and was never
confirmed on the watch.

**No health write API.** The docs contain nothing for writing food, calorie intake or
any health data into the Zepp app. Sensors such as `Calorie` are read-only.

## How the tests work

`node --import ./test/support/register.mjs --test "test/*.test.mjs"` (the glob matters:
bare `node --test` would also run the support files). `register.mjs` maps `@zos/*` and
`@zeppos/zml/*` to the mocks in `test/support` and adds `.js` to extensionless imports.
`harness.mjs` loads an app's real modules from its `app.json`; one app per test file,
because modules load once per process. The mock's `world` object is the watch and phone
state; flags such as `phoneConnected`, `messagingBroken` and `scene` cover the failure
cases. `world.internet` is the phone's internet: a function from URL to JSON body, or
`null` for offline. `world.now` drives both the watch's `Time` sensor and `Date.now()`
(the mock replaces it), so tests of anything time-based are deterministic.

`tools/preview.mjs` reuses the same mocks to draw `docs/*.png` and the watch face's
preview image. The mock's `VIEW_CONTAINER` lists its children in `world.widgets` with
`parent` set and their coordinates relative to it; the preview draws containers in
`z_index` order, clipped. `tools/settings-html.mjs <app> <file.html>` writes a settings
page as plain HTML that only imitates the Zepp components. On 2026-11-17 nothing on
this machine could screenshot it: T3's browser and the Playwright headless shell both
fail to start for missing system libraries (libatk and others). `TEXT` with `text_style.WRAP` is wrapped by estimated DejaVu widths, which
are wider than the watch's font, so a line that wraps there may not wrap on the watch. This machine has no system fonts; `tools/sharp.mjs` points sharp at the
bundled DejaVu fonts. Tile glyphs come from `@phosphor-icons/core` (MIT).

npm prints "install scripts blocked" warnings for esbuild, sharp and core-js. They are
harmless here.
