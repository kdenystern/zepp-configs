// The Tasks app's settings page in the Zepp app: where tasks are added,
// changed and deleted. It also shows today's list, which can be checked off
// here as well as on the watch. Everything is kept in settings storage; a
// write there redraws this page and reaches the watch through the side
// service.
import {
  TASKS_KEY,
  UNDO_KEY,
  readDb,
  readUndo,
  dateDay,
  addTask,
  editTask,
  deleteTask,
  moveTask,
  checkTask,
  uncheckTask,
  activeTasks,
  finishedTasks,
  dueTasks,
  taskText,
  repeatLabel,
  whenLabel,
  prettyDay,
} from '../lib/tasks'

import { THEME, page, card, text, note, input, button, addButton, row } from '../../../shared/settings-ui'

const SHOWN_DONE = 30
const SIDE = { marginLeft: '8px', flexShrink: '0' }
// Big targets for moving a task up or down: easy to hit with a thumb.
const MOVE = { flexShrink: '0', width: '56px', height: '48px', padding: '0', margin: '0', fontSize: '22px' }

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const day = dateDay(new Date(Date.now()))
    const db = readDb(storage.getItem(TASKS_KEY))
    const undo = readUndo(storage.getItem(UNDO_KEY), day)

    // Every change starts from what is stored now, not from what this page
    // was drawn with: the watch may have synced in between.
    const change = (action) => {
      const fresh = readDb(storage.getItem(TASKS_KEY))
      const freshUndo = readUndo(storage.getItem(UNDO_KEY), day)
      const before = JSON.stringify(freshUndo)
      if (!action(fresh, freshUndo)) return
      if (JSON.stringify(freshUndo) !== before) storage.setItem(UNDO_KEY, JSON.stringify(freshUndo))
      storage.setItem(TASKS_KEY, JSON.stringify(fresh))
    }

    const active = activeTasks(db)
    const due = dueTasks(active, day)
    const finished = finishedTasks(db)
    const last = undo.stack.length ? undo.stack[undo.stack.length - 1] : null

    return page([
      addButton('+  Add a task', (value) =>
        // Several lines pasted at once become several tasks.
        change((fresh) => String(value).split(/\r?\n/).filter((line) => addTask(fresh, line, day)).length > 0),
      ),
      note(
        'Type what to do. To make it repeat, end it with: every day, every 3 days, every week, every Mon and Thu, every month.',
      ),
      card(due.length ? `Today (${due.length})` : 'Today', '', [
        ...(due.length
          ? due.map((task) =>
              row(
                [
                  text(task.title, { margin: '0' }),
                  ...(task.repeat ? [note(repeatLabel(task.repeat), { margin: '0' })] : []),
                ],
                button('Done', () => change((fresh, freshUndo) => checkTask(fresh, freshUndo, task.id, day)), {
                  style: SIDE,
                }),
              ),
            )
          : [text(active.length ? 'Nothing left for today.' : 'No tasks yet.')]),
        ...(last
          ? [
              View({ style: { margin: '12px 0 8px' } }, [
                button(`Undo: ${last.title}`, () => change((fresh, freshUndo) => uncheckTask(fresh, freshUndo))),
              ]),
            ]
          : []),
      ]),
      card(
        'All tasks',
        'Tap a task to change its text or its repeat. Each one shows when it is next on the list. The arrows move a task up or down; the watch lists them in this order.',
        active.length
          ? active.map((task, index) =>
              row(
                [
                  View({ style: { display: 'flex', flexDirection: 'row', alignItems: 'center' } }, [
                    View({ style: { display: 'flex', flexDirection: 'column', gap: '6px', marginRight: '10px' } }, [
                      button('▲', () => change((fresh) => moveTask(fresh, task.id, -1)), {
                        style: { ...MOVE, opacity: index === 0 ? '0.3' : '1' },
                      }),
                      button('▼', () => change((fresh) => moveTask(fresh, task.id, 1)), {
                        style: { ...MOVE, opacity: index === active.length - 1 ? '0.3' : '1' },
                      }),
                    ]),
                    View({ style: { flex: 1, minWidth: 0 } }, [
                      input({
                        label: whenLabel(task, day),
                        value: taskText(task),
                        onChange: (value) => change((fresh) => editTask(fresh, task.id, value, day)),
                      }),
                    ]),
                  ]),
                ],
                button('Delete', () => change((fresh) => deleteTask(fresh, task.id)), {
                  style: { ...SIDE, color: THEME.bad },
                }),
              ),
            )
          : [text('Nothing here yet.')],
      ),
      card(
        'Done',
        'One-off tasks you have finished, newest first.',
        finished.length
          ? finished.slice(0, SHOWN_DONE).map((task) => text(`${prettyDay(task.done)}    ${task.title}`, { color: THEME.soft }))
          : [text('Nothing finished yet.')],
      ),
    ])
  },
})
