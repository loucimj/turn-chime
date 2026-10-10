import type { Register } from 'claude-code'

const DEFAULT_CHIME_SECONDS = 40
const DEFAULT_SPEAK_SECONDS = 300
const DEFAULT_SOUND = 'Glass'
const DEFAULT_VOICE = 'Daniel'
const SOUNDS = ['Glass', 'Hero', 'Ping', 'Funk', 'Submarine', 'Blow'] as const
const TITLE_MAX = 40
const TASK_MAX = 60

function seconds(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function pick(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

/** One spoken line out of a prompt: its first non-empty line, markdown stripped, cut at a word. */
export function taskLine(prompt: string, max = TASK_MAX): string {
  const line = prompt
    .split('\n')
    .map(l => l.replace(/[`*_#>]/g, '').replace(/\s+/g, ' ').trim())
    .find(l => l.length > 0) ?? ''
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const atWord = cut.lastIndexOf(' ')
  return (atWord > max / 2 ? cut.slice(0, atWord) : cut).trim()
}

/** What the voice says: "{title}. {task} is completed, sir." */
export function announcement(title: string, task: string): string {
  const head = title.trim().slice(0, TITLE_MAX)
  const body = task ? `${task} is completed, sir.` : 'Your task is completed, sir.'
  return head ? `${head}. ${body}` : body
}

export const register: Register = (on, options) => {
  const chimeMs = seconds(options.thresholdSeconds, DEFAULT_CHIME_SECONDS) * 1000
  const speakMs = seconds(options.speakAfterSeconds, DEFAULT_SPEAK_SECONDS) * 1000
  const sound = pick(options.sound, SOUNDS, DEFAULT_SOUND)
  const voice = typeof options.voice === 'string' && options.voice.trim() ? options.voice.trim() : DEFAULT_VOICE

  let sessionTitle = ''
  let lastPrompt = ''
  const promptByTurn = new Map<string, string>()

  // The settings hooks' own events carry the session's title; keep the latest.
  on('classic.SessionStart', ($, e, next) => {
    if (e.session_title) sessionTitle = e.session_title
    return next(e)
  })
  on('classic.UserPromptSubmit', ($, e, next) => {
    if (e.session_title) sessionTitle = e.session_title
    if (e.prompt.trim()) lastPrompt = e.prompt
    return next(e)
  })

  // Remember what each turn was asked, so its completion can name it.
  on('turn.start', ($, e, next) => {
    if (e.text.trim()) lastPrompt = e.text
    promptByTurn.set(e.turnId, lastPrompt)
    return next(e)
  })

  // Fires once a model turn has ended; only the main loop's turns count (a
  // subagent's run carries `agentId`), and an interrupted turn stays silent:
  // the person was there to interrupt it.
  on('turn.complete', async ($, e, next) => {
    const prompt = promptByTurn.get(e.turnId) ?? lastPrompt
    promptByTurn.delete(e.turnId)

    const isMainTurn = e.agentId === undefined && !e.isAborted
    const shouldChime = isMainTurn && e.durationMs >= chimeMs
    const shouldSpeak = isMainTurn && e.durationMs >= speakMs

    const notify = async () => {
      // afplay and say both mix with other audio on macOS: music keeps playing.
      if (shouldChime) await $.audio.play({ asset: `sounds/${sound}.aiff` }).catch(() => undefined)
      if (shouldSpeak) {
        const title = sessionTitle || (await fallbackTitle())
        await $.audio.speak(announcement(title, taskLine(prompt)), { voice }).catch(() => undefined)
      }
    }
    const fallbackTitle = async () => {
      try {
        const cwd = await $.session.cwd()
        return cwd.split('/').filter(Boolean).pop() ?? ''
      } catch {
        return ''
      }
    }

    const [result] = await Promise.all([next(e), notify()])
    return result
  })
}
