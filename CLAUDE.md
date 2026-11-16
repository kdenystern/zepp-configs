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
- **README rules (user, 2026-11-16).** It is for human readers: short, plain and
  level-headed. No verification status, no caveats about what is or is not proven, no
  explanations of platform limits the user already knows, nothing apologetic or
  promotional. It carries a notice that the whole repo was written by Claude Fable 5.2;
  keep it. Anything meant for an AI session (what is confirmed on hardware, toolchain
  traps, API facts) goes in this file, not the README.
- Keep this file current at the end of a piece of work (the user asked for that).

## What exists

| Path | What | App id |
| --- | --- | --- |
| `apps/watchface` | Launcher Face: thin-line watch face with a launcher button bottom right | 68233 |
| `apps/launcher` | Launcher app: scrolling grid of app tiles, configured from the phone | 68231 |
| `apps/nutrition` | Calorie and protein tracker | 68232 |
| `apps/weather` | Weather: today (or tomorrow) hour by hour on one screen | 68234 |
| `shared/` | `config.js` (text config parser), `layout.js` (tile grid), `icons.js` (icon table), `tiles.js` (draw and launch tiles) | |
| `test/support/` | Mock watch, phone, BLE link and internet | |
| `test/fixtures/` | A real Open-Meteo forecast answer (Helsinki), used by weather tests and previews | |
| `tools/` | `make-icons.mjs`, `preview.mjs`, `sharp.mjs` | |

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
bars, wind line with gust dashes. The charts are built **only from `FILL_RECT`s**
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

## Not yet confirmed on the watch

- The current watch face design as a whole, in particular `ARC_PROGRESS` and `TEXT_IMG`
  with `type: data_type.X` (documented for watch faces, not yet seen on this watch),
  the hours-over-minutes `IMG_TIME`, and the always-on display.
- Launcher scrolling with more than nine tiles.
- Whether phone config sync works (the user has not said), and `name:` / `screen:`
  targets.
- The Weather app as a whole (built 2026-11-16, never installed). Its watch drawing uses
  only `TEXT`, `FILL_RECT`, `BUTTON` and `IMG`. Unseen on hardware: `fetch` in the side
  service, the settings page's `Select` and `Button` components, whether the side
  service is started by a settings change while the watch app is closed (ZML has code
  for it; if not, the watch's first request does the place lookup instead),
  `Time.getTime()`, and how wide the texts come out in the watch's own font (the
  page avoids characters beyond `°` on purpose).

## User preferences

- Nutrition: the user only looks at today. They know Zepp's own calorie tracking cannot
  be written to and do not want it explained again. (The app still syncs day totals to
  the phone: 30 days kept on the watch, 180 in the settings page.)
- Square tiles; icons, not text. Flat colours and **thin lines**: gradients and heavy
  fills look bad on this low-resolution screen.
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
`props.settingsStorage`. ZML (`@zeppos/zml` 0.0.43) gives `this.request`/`onRequest`
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
preview image. It does not wrap text, so full-screen message texts are not previewed. This machine has no system fonts; `tools/sharp.mjs` points sharp at the
bundled DejaVu fonts. Tile glyphs come from `@phosphor-icons/core` (MIT).

npm prints "install scripts blocked" warnings for esbuild, sharp and core-js. They are
harmless here.
