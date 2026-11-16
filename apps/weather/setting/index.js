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
    const note = searchNote(search, query)

    return View({ style: { padding: '12px 16px' } }, [
      Section(
        {
          title: 'Place',
          description: place
            ? `The watch shows the weather for ${placeLabel(place)}.`
            : 'No place chosen yet. Search for your town or city.',
        },
        [
          TextInput({
            label: 'Search for a town or city',
            placeholder: 'For example: Lisbon',
            value: query,
            onChange: (value) => storage.setItem(QUERY_KEY, value.trim()),
          }),
          ...(note ? [Text({ paragraph: true }, note)] : []),
          ...results.map((result) =>
            Button({
              label: placeLabel(result),
              color: samePlace(result, place) ? 'primary' : 'default',
              style: { marginTop: '8px' },
              onClick: () => storage.setItem(PLACE_KEY, JSON.stringify(result)),
            }),
          ),
        ],
      ),
      Section({ title: 'Units' }, [
        Select({
          label: 'Temperature',
          options: options(TEMP_UNITS),
          value: units.temp,
          onChange: (value) => storage.setItem(TEMP_UNIT_KEY, value),
        }),
        Select({
          label: 'Wind speed',
          options: options(WIND_UNITS),
          value: units.wind,
          onChange: (value) => storage.setItem(WIND_UNIT_KEY, value),
        }),
      ]),
      Section({ title: 'About' }, [
        Text(
          { paragraph: true },
          'The watch asks this phone for a fresh forecast whenever the Weather app opens, and keeps the last one for when the phone is away.',
        ),
        Text({ paragraph: true }, 'Weather data by Open-Meteo.com (CC BY 4.0).'),
      ]),
    ])
  },
})
