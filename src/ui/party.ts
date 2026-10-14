import { color } from './colors.ts'

const FRAME_DURATION_MS = 180
const PARTY_FRAMES = [
  '🎉  PARTY TIME!  🥳',
  '🥳  PARTY TIME!  🎊',
  '🎊  PARTY TIME!  ✨',
  '✨  PARTY TIME!  🎈',
  '🎈  PARTY TIME!  🎉',
  '🎉  PARTY TIME!  🥳',
  '🥳  PARTY TIME!  🎊',
  '🎊  PARTY TIME!  ✨'
]
const PARTY_COLORS = ['35', '36', '33'] as const

export async function playParty(signal: AbortSignal): Promise<void> {
  if (process.env.PARTY_TIME === undefined || !process.stderr.isTTY || signal.aborted) return

  process.stderr.write('\x1b[?25l')
  try {
    for (const [index, frame] of PARTY_FRAMES.entries()) {
      if (signal.aborted) return
      const colorCode = PARTY_COLORS[index % PARTY_COLORS.length] ?? '35'
      process.stderr.write(`\r\x1b[2K${color(colorCode, frame)}`)
      await waitForFrame(signal)
    }
  } finally {
    process.stderr.write('\r\x1b[2K\x1b[?25h')
  }
}

function waitForFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      signal.removeEventListener('abort', done)
      resolve()
    }

    timeout = setTimeout(done, FRAME_DURATION_MS)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted) done()
  })
}
