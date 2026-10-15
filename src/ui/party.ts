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
const PARTY_TIME_ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])
// Each frame is 15 ASCII columns plus two 2-column emoji; keep one spare column so the cursor never wraps.
const PARTY_FRAME_MIN_COLUMNS = 20

function isTooNarrow(): boolean {
  const columns = process.stderr.columns
  return typeof columns === 'number' && columns < PARTY_FRAME_MIN_COLUMNS
}

export async function playParty(signal: AbortSignal): Promise<void> {
  const enabled = PARTY_TIME_ENABLED_VALUES.has((process.env.PARTY_TIME ?? '').trim().toLowerCase())
  if (!enabled || !process.stderr.isTTY || signal.aborted || isTooNarrow()) return

  process.stderr.write('\x1b[?25l')
  try {
    for (const [index, frame] of PARTY_FRAMES.entries()) {
      if (signal.aborted || isTooNarrow()) return
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
