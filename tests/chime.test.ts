import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { announcement, taskLine } from '../hooks/register'

type Played = { asset?: string; url?: string; base64?: string }
type Spoken = { text: string; voice?: string }

function listen(on: On, cwd = '/Users/me/workspaces/qontact') {
  const played: Played[] = []
  const spoken: Spoken[] = []
  on('audio.play', (_$, e) => {
    played.push(e.clip)
    return { value: undefined }
  })
  on('audio.speak', (_$, e) => {
    spoken.push({ text: e.text, voice: e.voice })
    return { value: { via: 'system' as const } }
  })
  on('session.cwd', () => ({ value: cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  return { played, spoken }
}

const turn = (durationMs: number, extra: Record<string, unknown> = {}) =>
  ({ answer: 'done', durationMs, isAborted: false, turnId: 't1', reason: 'answer' as const, ...extra })

test('plays the default sound once a main turn ran 40 seconds or more', async ($, on) => {
  const { played, spoken } = listen(on)
  const result = await $.turn.complete(turn(41_000))
  expect(result.text).toBe('done')
  expect(played).toHaveLength(1)
  expect(played[0]?.asset).toBe('sounds/Glass.aiff')
  expect(spoken).toHaveLength(0)

  await $.turn.complete(turn(40_000))
  expect(played).toHaveLength(2)
})

test('stays silent under the threshold', async ($, on) => {
  const { played, spoken } = listen(on)
  await $.turn.complete(turn(39_999))
  await $.turn.complete(turn(0))
  expect(played).toHaveLength(0)
  expect(spoken).toHaveLength(0)
})

test('stays silent for an interrupted turn and for a subagent turn', async ($, on) => {
  const { played, spoken } = listen(on)
  await $.turn.complete(turn(600_000, { isAborted: true, reason: 'aborted' }))
  await $.turn.complete(turn(600_000, { agentId: 'agent-1' }))
  expect(played).toHaveLength(0)
  expect(spoken).toHaveLength(0)
})

test('plays when a turn ended on an API error after the threshold', async ($, on) => {
  const { played } = listen(on)
  await $.turn.complete(turn(50_000, { reason: 'error' }))
  expect(played).toHaveLength(1)
})

test('after five minutes it chimes and announces the session title and the task in Daniel\'s voice', async ($, on) => {
  const { played, spoken } = listen(on)
  await $.classic.UserPromptSubmit({ prompt: 'Migrate the payslips bucket to **signed URLs**\n\nmore details here', session_title: 'Private payslip files' })
  await $.turn.start({ text: 'Migrate the payslips bucket to **signed URLs**\n\nmore details here', turnId: 't1' })
  await $.turn.complete(turn(300_000))
  expect(played).toHaveLength(1)
  expect(spoken).toHaveLength(1)
  expect(spoken[0]?.voice).toBe('Daniel')
  expect(spoken[0]?.text).toBe('Private payslip files. Migrate the payslips bucket to signed URLs is completed, sir.')
})

test('does not speak just under five minutes', async ($, on) => {
  const { played, spoken } = listen(on)
  await $.turn.start({ text: 'do a thing', turnId: 't1' })
  await $.turn.complete(turn(299_999))
  expect(played).toHaveLength(1)
  expect(spoken).toHaveLength(0)
})

test('falls back to the working folder name when the session has no title, and to a generic line with no prompt', async ($, on) => {
  const { spoken } = listen(on, '/Users/me/workspaces/qeeptouch/qontact')
  await $.turn.start({ text: '', turnId: 't1' })
  await $.turn.complete(turn(400_000))
  expect(spoken[0]?.text).toBe('qontact. Your task is completed, sir.')
})

test('names the turn that completed, not a later prompt', async ($, on) => {
  const { spoken } = listen(on)
  await $.classic.SessionStart({ source: 'startup', session_title: 'Qontact' })
  await $.turn.start({ text: 'first task', turnId: 'a' })
  await $.turn.start({ text: 'second task', turnId: 'b' })
  await $.turn.complete(turn(500_000, { turnId: 'a' }))
  expect(spoken[0]?.text).toBe('Qontact. first task is completed, sir.')
})

test('honours the configured thresholds, sound and voice', { options: { thresholdSeconds: '20', speakAfterSeconds: '60', sound: 'Hero', voice: 'Moira' } }, async ($, on) => {
  const { played, spoken } = listen(on)
  await $.turn.complete(turn(19_000))
  expect(played).toHaveLength(0)
  await $.turn.complete(turn(21_000))
  expect(played).toHaveLength(1)
  expect(played[0]?.asset).toBe('sounds/Hero.aiff')
  expect(spoken).toHaveLength(0)
  await $.turn.complete(turn(61_000))
  expect(spoken).toHaveLength(1)
  expect(spoken[0]?.voice).toBe('Moira')
})

test('falls back to defaults on values outside the options', { options: { thresholdSeconds: 'abc', sound: 'Nope' } }, async ($, on) => {
  const { played } = listen(on)
  await $.turn.complete(turn(39_000))
  expect(played).toHaveLength(0)
  await $.turn.complete(turn(40_000))
  expect(played[0]?.asset).toBe('sounds/Glass.aiff')
})

test('taskLine takes the first line, strips markdown and cuts at a word', () => {
  expect(taskLine('\n\n## Fix `foo` please\nmore')).toBe('Fix foo please')
  const long = 'word '.repeat(30).trim()
  const cut = taskLine(long)
  expect(cut.length).toBeLessThanOrEqual(60)
  expect(cut.endsWith('word')).toBe(true)
  expect(taskLine('')).toBe('')
})

test('announcement composes title and task', () => {
  expect(announcement('My session', 'build it')).toBe('My session. build it is completed, sir.')
  expect(announcement('', 'build it')).toBe('build it is completed, sir.')
  expect(announcement('', '')).toBe('Your task is completed, sir.')
})
