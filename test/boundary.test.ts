import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ENGINE_DIR = join(__dirname, '..', 'src')

/** Packages the matching engine must never depend on. */
const FORBIDDEN_PACKAGES = [
  '@isdk/ai-tool',
  '@isdk/ai-tool-agent',
]

/** Node builtins that would break browser bundles. */
const FORBIDDEN_BUILTINS = /^node:/

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return collectTsFiles(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+'([^']+)'/g)]
    .map((m) => m[1])
    .concat(
      [...source.matchAll(/import\(\s*'([^']+)'\s*\)/g)].map((m) => m[1])
    )
}

describe('match-ex boundary', () => {
  const files = collectTsFiles(ENGINE_DIR)

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('does not depend on the AI packages', () => {
    const offenders = files.flatMap((file) =>
      importsOf(readFileSync(file, 'utf8'))
        .filter((spec) => FORBIDDEN_PACKAGES.includes(spec))
        .map((spec) => `${file} -> ${spec}`)
    )
    expect(offenders).toEqual([])
  })

  it('does not import node builtins', () => {
    const offenders = files.flatMap((file) =>
      importsOf(readFileSync(file, 'utf8'))
        .filter((spec) => FORBIDDEN_BUILTINS.test(spec))
        .map((spec) => `${file} -> ${spec}`)
    )
    expect(offenders).toEqual([])
  })

  it('keeps every relative import inside the engine', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const spec of importsOf(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue
        // Resolve the specifier relative to the importing file's directory and
        // make sure it still lands under src/match-ex.
        const resolved = join(file, '..', spec)
        if (!resolved.startsWith(ENGINE_DIR)) {
          offenders.push(`${file} -> ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
