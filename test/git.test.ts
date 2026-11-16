import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, test } from 'vitest'
import { partitionDiff, sectionPaths } from '../src/diff.ts'
import { getRecentCommitMessages, getStagedDiff, getStagedFiles, getStagedStat } from '../src/git.ts'

describe('recent commit history', () => {
  test('unborn history is empty; messages include bodies, exclude merges and stop at 100 newest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cco-history-'))
    const original = process.cwd()
    const run = async (args: string[], input?: string, timestamp = 1700000000) => {
      const child = spawn(
        'git',
        [
          '-C',
          dir,
          '-c',
          'user.name=cco',
          '-c',
          'user.email=cco@example.invalid',
          '-c',
          'commit.gpgsign=false',
          ...args
        ],
        {
          env: {
            ...process.env,
            GIT_AUTHOR_DATE: `${timestamp} +0000`,
            GIT_COMMITTER_DATE: `${timestamp} +0000`
          }
        }
      )
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk
      })
      await new Promise<void>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr))))
        child.stdin.on('error', reject)
        child.stdin.end(input)
      })
      return stdout.trim()
    }
    try {
      await run(['init', '-q'])
      process.chdir(dir)
      expect(await getRecentCommitMessages()).toEqual([])
      const tree = await run(['hash-object', '-t', 'tree', '-w', '--stdin'])
      const commits: string[] = []
      for (let index = 0; index < 103; index++) {
        const parent = commits.at(-1)
        commits.push(
          await run(
            ['commit-tree', tree, ...(parent ? ['-p', parent] : [])],
            `change ${index}\n\nBody ${index}\nTrailer: value\n`,
            1700000000 + index
          )
        )
      }
      const fork = commits[50] ?? expect.unreachable('expected a fork commit')
      const latest = commits.at(-1) ?? expect.unreachable('expected a latest commit')
      const side = await run(['commit-tree', tree, '-p', fork], 'side\n\nSide body\n', 1700000103)
      const merge = await run(['commit-tree', tree, '-p', latest, '-p', side], 'merge not a style sample\n', 1700000104)
      await run(['update-ref', 'HEAD', merge])
      const history = await getRecentCommitMessages()
      expect(history).toHaveLength(100)
      expect(history[0]).toBe('side\n\nSide body')
      expect(history[1]).toBe('change 102\n\nBody 102\nTrailer: value')
      expect(history.join('\n')).not.toContain('merge not a style sample')
      expect(history).not.toContain('change 0\n\nBody 0\nTrailer: value')

      const verifier = join(dir, 'verify-signature.sh')
      const marker = join(dir, 'signature-checked')
      await writeFile(verifier, `#!/bin/sh\ntouch "${marker}"\nexit 1\n`, {
        mode: 0o755
      })
      await run(['config', 'gpg.program', verifier])
      await run(['config', 'log.showSignature', 'true'])
      await run(['config', 'i18n.logOutputEncoding', 'ISO-8859-1'])
      const signed = await run(
        ['hash-object', '-t', 'commit', '-w', '--stdin'],
        `tree ${tree}\nparent ${merge}\nauthor cco <cco@example.invalid> 1700000105 +0000\n` +
          'committer cco <cco@example.invalid> 1700000105 +0000\n' +
          'gpgsig -----BEGIN PGP SIGNATURE-----\n dummy\n -----END PGP SIGNATURE-----\n\nfeat: café 😀\n'
      )
      await run(['update-ref', 'HEAD', signed])
      expect((await getRecentCommitMessages())[0]).toBe('feat: café 😀')
      await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      process.chdir(original)
      await rm(dir, { recursive: true, force: true })
    }
  })
})

/**
 * A throwaway repository with `top.txt`, `sub/file.txt` and a freshly added
 * submodule `engine` staged, and every user-level diff setting that could
 * change the diff's shape or membership switched on: `diff.relative`,
 * `diff.noprefix`, `diff.mnemonicPrefix`, `diff.submodule=log` (replaces the
 * gitlink section with a header-less `Submodule ...` block),
 * `diff.ignoreSubmodules=all` (hides the gitlink entirely) and
 * `diff.external` (an external driver that forges a `diff --git` header).
 * Runs `fn` with the working directory inside `sub/`, then restores it.
 */
const execFileAsync = promisify(execFile)

/** Run one git command in `dir`, throwing on a non-zero exit. */
async function gitIn(dir: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', dir, ...args])
}

async function withStagedRepo(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'cco-git-'))
  const originalCwd = process.cwd()
  try {
    // A one-commit repository to add as a submodule (signing off: the
    // user's global 1Password signer cannot run headless).
    const engine = join(dir, 'engine-src')
    await mkdir(engine)
    await gitIn(engine, 'init', '-q')
    await gitIn(engine, 'config', 'user.email', 'cco@example.invalid')
    await gitIn(engine, 'config', 'user.name', 'cco')
    await gitIn(engine, 'config', 'commit.gpgsign', 'false')
    await writeFile(join(engine, 'engine.txt'), 'engine\n')
    await gitIn(engine, 'add', '-A')
    await gitIn(engine, 'commit', '-qm', 'engine')

    const externalDiff = join(dir, 'external-diff.sh')
    await writeFile(externalDiff, '#!/bin/sh\necho "diff --git a/hijacked.txt b/hijacked.txt"\n', {
      mode: 0o755
    })

    const repo = join(dir, 'repo')
    await mkdir(repo)
    await gitIn(repo, 'init', '-q')
    await gitIn(repo, 'config', 'user.email', 'cco@example.invalid')
    await gitIn(repo, 'config', 'user.name', 'cco')
    await gitIn(repo, 'config', 'diff.relative', 'true')
    await gitIn(repo, 'config', 'diff.noprefix', 'true')
    await gitIn(repo, 'config', 'diff.mnemonicPrefix', 'true')
    await gitIn(repo, 'config', 'diff.submodule', 'log')
    await gitIn(repo, 'config', 'diff.ignoreSubmodules', 'all')
    await gitIn(repo, 'config', 'diff.external', externalDiff)
    await writeFile(join(repo, 'top.txt'), 'top\n')
    await mkdir(join(repo, 'sub'))
    await writeFile(join(repo, 'sub', 'file.txt'), 'nested\n')
    await gitIn(repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', engine, 'engine')
    await gitIn(repo, 'add', '-A')
    process.chdir(join(repo, 'sub'))
    await fn(repo)
  } finally {
    process.chdir(originalCwd)
    await rm(dir, { recursive: true, force: true })
  }
}

describe('staged-change readers', () => {
  test('getStagedDiff ignores diff.relative/noprefix/mnemonicPrefix and the invocation directory', async () => {
    await withStagedRepo(async () => {
      const diff = await getStagedDiff()
      // diff.relative would drop top.txt entirely and strip `sub/`;
      // noprefix/mnemonicPrefix would change the a/ b/ prefixes.
      expect(diff).toContain('diff --git a/top.txt b/top.txt')
      expect(diff).toContain('diff --git a/sub/file.txt b/sub/file.txt')
      expect(diff).toContain('+++ b/sub/file.txt')
      expect(diff).toContain('+++ b/top.txt')
    })
  })

  test('getStagedDiff keeps a submodule as its own diff --git section despite diff.submodule/ignoreSubmodules', async () => {
    await withStagedRepo(async () => {
      const diff = await getStagedDiff()
      expect(diff).toContain('diff --git a/engine b/engine')
      expect(diff).toContain('+Subproject commit')
      expect(diff).not.toContain('Submodule engine')
      // The gitlink section is recognisable and partitionable on its own.
      const { primary, totalFiles } = partitionDiff(diff, () => false)
      const engineSection = primary.split('\ndiff --git ').find((section) => section.includes('a/engine b/engine'))
      expect(engineSection).toBeDefined()
      expect(sectionPaths(`diff --git ${(engineSection ?? '').replace(/^diff --git /, '')}`)).toEqual(['engine'])
      expect(totalFiles).toBe(4) // .gitmodules, engine, sub/file.txt, top.txt
    })
  })

  test('getStagedDiff never runs an external diff driver', async () => {
    await withStagedRepo(async () => {
      const diff = await getStagedDiff()
      expect(diff).not.toContain('hijacked')
      expect(diff).toContain('+++ b/top.txt')
    })
  })

  test('getStagedFiles and getStagedStat cover the whole staged set from a subdirectory', async () => {
    await withStagedRepo(async () => {
      const files = await getStagedFiles()
      expect(files.map((file) => file.path).sort()).toEqual(['.gitmodules', 'engine', 'sub/file.txt', 'top.txt'])
      const stat = await getStagedStat()
      expect(stat).toContain('top.txt')
      expect(stat).toContain('sub/file.txt')
      expect(stat).toContain('engine')
    })
  })
})
