import { constants } from 'node:fs'
import { link, mkdtemp, open, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { setupCommitStyle } from '../src/commit-style.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    link: vi.fn(actual.link),
    open: vi.fn(actual.open)
  }
})

const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
let root: string
beforeEach(async () => {
  vi.clearAllMocks()
  root = await mkdtemp(join(tmpdir(), 'cco-style-files-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function setup() {
  return setupCommitStyle({
    repoRoot: root,
    model: 'fable',
    allowApiKey: false,
    yes: true,
    hasTty: false,
    validateModel: async () => {},
    readHistory: async () => ['feat: change'],
    runner: async () => ({ text: '# Style', costUsd: 0 })
  })
}

test('publishes a fully written guide through an exclusive hard link', async () => {
  vi.mocked(link).mockImplementationOnce(async (source, destination) => {
    expect(await readFile(source, 'utf8')).toBe('# Style\n')
    await expect(readFile(destination)).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await actual.link(source, destination)
  })
  expect(await setup()).toBe('# Style\n')
  expect(await readdir(root)).toEqual(['COMMITS.md'])
})

test('a failed partial write leaves neither a published guide nor a temporary file', async () => {
  vi.mocked(writeFile).mockImplementationOnce(async (path) => {
    await actual.writeFile(path, 'partial')
    throw new Error('disk full')
  })
  await expect(setup()).rejects.toThrow('disk full')
  expect(link).not.toHaveBeenCalled()
  expect(await readdir(root)).toEqual([])
})

test('a guide appearing at publication wins without being overwritten', async () => {
  vi.mocked(link).mockImplementationOnce(async (source, destination) => {
    await actual.writeFile(destination, 'concurrent guide')
    await actual.link(source, destination)
  })
  expect(await setup()).toBe('concurrent guide')
  expect(await readFile(join(root, 'COMMITS.md'), 'utf8')).toBe('concurrent guide')
  expect(await readdir(root)).toEqual(['COMMITS.md'])
})

test('a failed publication removes the temporary file', async () => {
  vi.mocked(link).mockRejectedValueOnce(new Error('link failed'))
  await expect(setup()).rejects.toThrow('link failed')
  expect(await readdir(root)).toEqual([])
})

test('validates and reads the same descriptor even if the path is replaced', async () => {
  const path = join(root, 'COMMITS.md')
  await actual.writeFile(path, 'original guide')
  await actual.writeFile(join(root, 'other.md'), 'untrusted replacement')
  vi.mocked(open).mockImplementationOnce(async (file, flags) => {
    expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const handle = await actual.open(file, flags)
    await actual.rename(path, `${path}.old`)
    await actual.symlink(join(root, 'other.md'), path)
    return handle
  })
  expect(await setup()).toBe('original guide')
})

test('closes the descriptor when reading fails', async () => {
  const path = join(root, 'COMMITS.md')
  await actual.writeFile(path, 'guide')
  const handle = await actual.open(path, 'r')
  const close = vi.spyOn(handle, 'close')
  vi.spyOn(handle, 'readFile').mockRejectedValueOnce(new Error('read failed'))
  vi.mocked(open).mockResolvedValueOnce(handle)
  await expect(setup()).rejects.toThrow('read failed')
  expect(close).toHaveBeenCalledOnce()
})
