// Puts the Foldkit repository at repos/foldkit, at the release tag matching
// the installed foldkit package, so agents can read its source, examples and
// docs (see FOLDKIT.md). repos/ is gitignored: this is a local reference copy,
// not a vendored subtree. Run it again after upgrading Foldkit.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'

const REPOSITORY = 'https://github.com/foldkit/foldkit.git'
const TARGET = 'repos/foldkit'

const { version } = JSON.parse(
  readFileSync('node_modules/foldkit/package.json', 'utf8'),
)
const tag = `foldkit@${version}`

const checkedOutTag = (): string | undefined => {
  try {
    return execFileSync(
      'git',
      [
        '-C',
        TARGET,
        'describe',
        '--tags',
        '--exact-match',
        '--match',
        'foldkit@*',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return undefined
  }
}

if (existsSync(TARGET) && checkedOutTag() === tag) {
  console.log(`${TARGET} is already at ${tag}`)
} else {
  rmSync(TARGET, { recursive: true, force: true })
  execFileSync(
    'git',
    [
      '-c',
      'advice.detachedHead=false',
      'clone',
      '--quiet',
      '--depth',
      '1',
      '--branch',
      tag,
      REPOSITORY,
      TARGET,
    ],
    { stdio: 'inherit' },
  )
  console.log(`${TARGET} is now at ${tag}`)
}
