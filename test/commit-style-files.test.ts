import { constants } from 'node:fs'
import { link, mkdtemp, open, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { setupCommitStyle } from '../src/commit-style.ts'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, constants: { ...actual.constants } }
})

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
const noFollow = constants.O_NOFOLLOW
beforeEach(async () => {
  vi.clearAllMocks()
  root = await mkdtemp(join(tmpdir(), 'cco-style-files-'))
})
afterEach(async () => {
  Reflect.set(constants, 'O_NOFOLLOW', noFollow)
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

test('reads a regular guide without O_NOFOLLOW when the flag is unavailable', async () => {
  await actual.writeFile(join(root, 'COMMITS.md'), '# Existing guide')
  Reflect.set(constants, 'O_NOFOLLOW', undefined)
  expect(await setup()).toBe('# Existing guide')
  expect(open).toHaveBeenCalledWith(join(root, 'COMMITS.md'), constants.O_RDONLY | constants.O_NONBLOCK)
})

test('rejects a symlink before opening when O_NOFOLLOW is unavailable', async () => {
  const target = join(root, 'target.md')
  await actual.writeFile(target, '# Target guide')
  await actual.symlink(target, join(root, 'COMMITS.md'))
  Reflect.set(constants, 'O_NOFOLLOW', undefined)
  await expect(setup()).rejects.toThrow('COMMITS.md must be a regular file.')
  expect(open).not.toHaveBeenCalled()
})

test('creates exclusively without O_NOFOLLOW when hard links and the flag are unavailable', async () => {
  Reflect.set(constants, 'O_NOFOLLOW', undefined)
  vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }))
  expect(await setup()).toBe('# Style\n')
  expect(open).toHaveBeenCalledWith(join(root, 'COMMITS.md'), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL)
  expect(await readFile(join(root, 'COMMITS.md'), 'utf8')).toBe('# Style\n')
  expect(await readdir(root)).toEqual(['COMMITS.md'])
})

test.each(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'])(
  'falls back to exclusive creation when hard links fail with %s',
  async (code) => {
    vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('unsupported link'), { code }))
    expect(await setup()).toBe('# Style\n')
    expect(await readFile(join(root, 'COMMITS.md'), 'utf8')).toBe('# Style\n')
    expect(await readdir(root)).toEqual(['COMMITS.md'])
    expect(open).toHaveBeenCalledWith(
      join(root, 'COMMITS.md'),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW
    )
  }
)

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

test('fsyncs and closes an exclusively created fallback guide', async () => {
  const handles: Awaited<ReturnType<typeof actual.open>>[] = []
  vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('unsupported'), { code: 'ENOTSUP' }))
  vi.mocked(open)
    .mockImplementationOnce(actual.open)
    .mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      vi.spyOn(handle, 'sync')
      vi.spyOn(handle, 'close')
      handles.push(handle)
      return handle
    })
  expect(await setup()).toBe('# Style\n')
  expect(handles[0]?.sync).toHaveBeenCalledOnce()
  expect(handles[0]?.close).toHaveBeenCalledOnce()
})

test.each(['writeFile', 'sync'] as const)('removes a partial fallback guide after %s fails', async (method) => {
  vi.mocked(link).mockRejectedValueOnce(Object.assign(new Error('unsupported'), { code: 'EPERM' }))
  vi.mocked(open)
    .mockImplementationOnce(actual.open)
    .mockImplementationOnce(async (path, flags) => {
      const handle = await actual.open(path, flags)
      vi.spyOn(handle, method).mockRejectedValueOnce(new Error('disk full'))
      return handle
    })
  await expect(setup()).rejects.toThrow('disk full')
  expect(await readdir(root)).toEqual([])
})

test('fallback never overwrites a guide that appears before exclusive creation', async () => {
  vi.mocked(link).mockImplementationOnce(async (_source, destination) => {
    await actual.writeFile(destination, 'concurrent guide')
    throw Object.assign(new Error('unsupported'), { code: 'ENOSYS' })
  })
  expect(await setup()).toBe('concurrent guide')
  expect(await readFile(join(root, 'COMMITS.md'), 'utf8')).toBe('concurrent guide')
  expect(await readdir(root)).toEqual(['COMMITS.md'])
})

test('fallback refuses a symlink that appears before exclusive creation', async () => {
  const target = join(root, 'target.md')
  await actual.writeFile(target, 'keep target')
  vi.mocked(link).mockImplementationOnce(async (_source, destination) => {
    await actual.symlink(target, destination)
    throw Object.assign(new Error('unsupported'), { code: 'EXDEV' })
  })
  await expect(setup()).rejects.toThrow('COMMITS.md must be a regular file')
  expect(await readFile(target, 'utf8')).toBe('keep target')
  expect(await readdir(root)).toEqual(['COMMITS.md', 'target.md'])
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
