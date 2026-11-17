// The Weather app's settings page in the Zepp app: where the forecast is for,
// and in which units. The search itself runs in the side service, which
// writes the matches back into settings storage; that redraws this page.
import {
  QUERY_KEY,
  SEARCH_KEY,
  RESULTS_KEY,
  PLACE_KEY,
  TEMP_UNIT_KEY,
  WIND_UNIT_KEY,
  TEMP_UNITS,
  WIND_UNITS,
  readPlace,
  readResults,
  readSearch,
  readUnits,
  placeLabel,
  samePlace,
} from '../lib/forecast'

import { page, card, text, note, field, button, choice } from '../../../shared/settings-ui'

const options = (table) => Object.keys(table).map((value) => ({ name: table[value].name, value }))

function searchNote(search, query) {
  if (!search || search.query !== query) return ''
  if (search.state === 'searching') return 'Searching... If nothing shows up, open Weather on the watch.'
  if (search.state === 'none') return `Nothing found for "${query}". Try the nearest larger town.`
  if (search.state === 'failed') return 'The search failed. Check the internet connection and try again.'
  return ''
}

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const getItem = (key) => storage.getItem(key)
    const query = String(getItem(QUERY_KEY) || '').trim()
    const place = readPlace(getItem(PLACE_KEY))
    const search = readSearch(getItem(SEARCH_KEY))
    // Matches belong to the search that produced them.
    const results = search && search.query === query ? readResults(getItem(RESULTS_KEY)) : []
    const units = readUnits(getItem)
    const searching = searchNote(search, query)

    return page([
      card(
        'Place',
        place ? `The watch shows the weather for ${placeLabel(place)}.` : 'No place chosen yet. Search for your town or city.',
        [
          field({
            label: 'Search for a town or city',
            placeholder: 'For example: Lisbon',
            value: query,
            onChange: (value) => storage.setItem(QUERY_KEY, value.trim()),
          }),
          ...(searching ? [text(searching)] : []),
          ...results.map((result) =>
            View({ style: { marginBottom: '8px' } }, [
              button(placeLabel(result), () => storage.setItem(PLACE_KEY, JSON.stringify(result)), {
                chosen: samePlace(result, place),
              }),
            ]),
          ),
        ],
      ),
      card('Units', '', [
        choice('Temperature', options(TEMP_UNITS), units.temp, (value) => storage.setItem(TEMP_UNIT_KEY, value)),
        choice('Wind speed', options(WIND_UNITS), units.wind, (value) => storage.setItem(WIND_UNIT_KEY, value)),
      ]),
      card('About', '', [
        note(
          'The watch asks this phone for a fresh forecast whenever the Weather app opens, and keeps the last one for when the phone is away.',
        ),
        note('Weather data by Open-Meteo.com (CC BY 4.0).'),
      ]),
    ])
  },
})
