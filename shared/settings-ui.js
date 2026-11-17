// The look of every app's settings page in the Zepp app: dark, with grey
// cards, like the Zepp app around it. The Zepp components are plain web
// elements that take CSS, so each one is given its colours here; `Section`
// and `Select` are not used because theirs cannot be set.
//
// View, Text, TextInput and Button are globals of the settings runtime.

export const THEME = {
  page: '#121315',
  card: '#202125',
  field: '#2a2b2f',
  line: '#33343a',
  chip: '#38393d',
  text: '#ffffff',
  soft: '#9b9ca3',
  bad: '#ff8a7a',
  light: '#ffffff',
  onLight: '#000000',
}

const PAGE = {
  minHeight: '100vh',
  boxSizing: 'border-box',
  padding: '12px 12px 32px',
  background: THEME.page,
  // Paints past the page's own edges too, whatever margin is left around it.
  boxShadow: `0 0 0 100vmax ${THEME.page}`,
  color: THEME.text,
  fontSize: '15px',
  lineHeight: '1.4',
}
const CARD = {
  background: THEME.card,
  borderRadius: '14px',
  padding: '14px 14px 8px',
  marginBottom: '12px',
  color: THEME.text,
}
const TITLE = {
  color: THEME.text,
  fontSize: '13px',
  fontWeight: '600',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  margin: '0 0 10px',
}
const BODY = { color: THEME.text, fontSize: '15px', margin: '0 0 8px' }
const SMALL = { color: THEME.soft, fontSize: '13px', margin: '0 0 8px' }
const FIELD = {
  background: THEME.field,
  borderRadius: '10px',
  padding: '10px 12px',
  marginBottom: '8px',
  color: THEME.text,
}
const PILL = {
  borderRadius: '22px',
  border: 'none',
  boxShadow: 'none',
  padding: '6px 16px',
  fontSize: '14px',
  textTransform: 'none',
}
const CHOSEN = { background: THEME.light, color: THEME.onLight }
const PLAIN = { background: THEME.chip, color: THEME.text }
const ADD = {
  background: THEME.light,
  color: THEME.onLight,
  borderRadius: '26px',
  lineHeight: '52px',
  textAlign: 'center',
  fontSize: '16px',
  fontWeight: '600',
  padding: '0 16px',
  marginBottom: '12px',
}

export const page = (children) => View({ style: PAGE }, children)

// A grey panel that starts with its title, then an optional line about it.
export const card = (title, description, children) =>
  View({ style: CARD }, [
    ...(title ? [Text({ paragraph: true, style: TITLE }, title)] : []),
    ...(description ? [note(description)] : []),
    ...children,
  ])

export const text = (content, style) => Text({ paragraph: true, style: { ...BODY, ...style } }, content)
export const note = (content, style) => Text({ paragraph: true, style: { ...SMALL, ...style } }, content)
export const problem = (content) => text(content, { color: THEME.bad })
export const heading = (content) => Text({ paragraph: true, bold: true, style: { ...BODY, margin: '10px 0 4px' } }, content)

// A text the user can tap to change: its label in grey, its value in white.
export const input = (props) =>
  TextInput({
    labelStyle: { color: THEME.soft, fontSize: '13px' },
    subStyle: { color: THEME.text, fontSize: '15px', ...(props.multiline ? { whiteSpace: 'pre-wrap' } : {}) },
    ...props,
  })
export const field = (props) => View({ style: FIELD }, [input(props)])

// A grey pill. `chosen` makes it white, as the Zepp app marks its selected tab.
export const button = (label, onClick, { chosen = false, style } = {}) =>
  Button({ label, onClick, style: { ...PILL, ...(chosen ? CHOSEN : PLAIN), ...style } })
export const isChosen = (node) => node.props.style.background === CHOSEN.background

// The way the official to-do sample makes a button that asks for text: a
// TextInput with a label and no value, inside a View that looks like a button.
export const addButton = (label, onChange) =>
  View({ style: ADD }, [
    TextInput({ label, labelStyle: { color: THEME.onLight, fontSize: '16px', fontWeight: '600' }, onChange }),
  ])

// One of a few: a pill per option, the current one white.
export const choice = (label, options, value, onChange) =>
  View({ style: { marginBottom: '6px' } }, [
    note(label),
    View(
      { style: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap' } },
      options.map((option) =>
        button(option.name, () => onChange(option.value), {
          chosen: option.value === value,
          style: { margin: '0 8px 8px 0' },
        }),
      ),
    ),
  ])

// Something on the left, a button on the right, a thin rule underneath.
export const row = (main, side) =>
  View(
    {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '8px 0',
        borderBottom: `1px solid ${THEME.line}`,
      },
    },
    [View({ style: { flex: 1, minWidth: 0 } }, main), side],
  )
