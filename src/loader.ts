import { camelCase } from 'lodash-es'
import { ValidationOperatorHandler, ValidationContext } from './types.js'
import { processValidationResult } from './utils.js'
import { ValidationResult } from './types.js'

/**
 * Converts a filesystem path into a `file:` URL without relying on any node
 * builtin, so this module stays isomorphic (node, browser and bundlers).
 */
function pathToUrl(path: string): string {
  let p = path.replace(/\\/g, '/')
  if (/^[a-zA-Z]:/.test(p)) p = '/' + p // Windows drive letter: C:/x -> /C:/x
  else if (!p.startsWith('/')) p = '/' + p
  return 'file://' + encodeURI(p)
}

/**
 * Builds a base URL (always with a trailing slash) from a base directory.
 * Accepts either an already-formed URL (`file:///a/b`, `https://x/y`) or a
 * plain filesystem path.
 */
function toBaseUrl(baseDir: string): string {
  const base = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(baseDir)
    ? baseDir.replace(/\\/g, '/')
    : pathToUrl(baseDir)
  return base.endsWith('/') ? base : base + '/'
}

function isAbsolutePath(specifier: string): boolean {
  return (
    specifier.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(specifier)
  )
}

/**
 * Resolves an operator module specifier to something that can be handed to
 * `import()`.
 *
 * Uses the standard `URL` API only — no `node:path` / `node:url` — so the
 * loader can be bundled for the browser.
 */
export function resolveModuleUrl(specifier: string, baseDir?: string): string {
  // Already a full URL (file:, http:, data:, node:, …) — use as-is.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(specifier)) return specifier

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return baseDir ? new URL(specifier, toBaseUrl(baseDir)).href : specifier
  }

  if (isAbsolutePath(specifier)) return pathToUrl(specifier)

  // Bare specifier (npm package) — let `import()` resolve it.
  return specifier
}

/**
 * Simplified operator handler signature exposed to user-land custom operators.
 *
 * Receives `(actual, expected, fixture)` and returns a plain
 * `ValidationResult` (sync or async). Use {@link wrapCustomOperator} to adapt
 * it to the internal {@link ValidationOperatorHandler} signature — the
 * fixture passed in additionally carries `$data`, `$options` (from an
 * `expected.$value` wrapper) and `$validate` for recursive matching.
 */
export type CustomOperatorHandler = (
  actual: any,
  expected: any,
  fixture: any
) => Promise<ValidationResult> | ValidationResult

/**
 * Wraps a custom operator handler to match the internal ValidationOperatorHandler signature.
 */
export function wrapCustomOperator(
  handler: CustomOperatorHandler
): ValidationOperatorHandler {
  return async (actual, expected, ctx, validate) => {
    const fixture: any = {
      ...(ctx.input && typeof ctx.input === 'object'
        ? ctx.input
        : { input: ctx.input }),
      $data: ctx.data,
      $validate: (act: any, exp: any) => validate(act, exp, ctx),
    }

    let options: any
    if (
      expected !== null &&
      typeof expected === 'object' &&
      '$value' in expected
    ) {
      options = { ...expected }
      delete options.$value
      expected = expected.$value
    }
    fixture.$options = options

    const result = await handler(actual, expected, fixture)
    return processValidationResult(result, expected, actual, ctx)
  }
}

/**
 * Loads operators from a record of strings or handlers, or an array of strings.
 * Strings are treated as module paths with optional export names (e.g., "js://./utils.js#myOp").
 * If an array is provided, names are inferred from the paths or export names.
 */
export async function loadOperators(
  operators:
    | Record<string, string | ValidationOperatorHandler | CustomOperatorHandler>
    | (string | ValidationOperatorHandler | CustomOperatorHandler)[],
  baseDir?: string
): Promise<Record<string, ValidationOperatorHandler>> {
  const result: Record<string, ValidationOperatorHandler> = {}
  if (!operators) return result

  const opEntries = Array.isArray(operators)
    ? operators
        .map((v, index) => {
          if (!v) return null
          let name = ''
          if (typeof v === 'string') {
            const filename = v.split('#')[0].split('/').pop() || ''
            const part =
              v.split('#')[1] ||
              camelCase(filename.replace(/\.(js|ts|mjs|cjs|jsx|tsx)$/, ''))
            name = part || ''
          } else if (typeof v === 'function') {
            name = v.name || `op${index}`
          }
          if (name && !name.startsWith('$')) {
            name = '$' + name
          }
          return name ? ([name, v] as [string, any]) : null
        })
        .filter((entry): entry is [string, any] => !!entry)
    : Object.entries(operators)

  for (let [name, value] of opEntries) {
    if (!name.startsWith('$')) {
      name = '$' + name
    }
    if (typeof value === 'function') {
      if (value.length === 4) {
        result[name] = value as ValidationOperatorHandler
      } else {
        result[name] = wrapCustomOperator(value as CustomOperatorHandler)
      }
    } else if (typeof value === 'string') {
      let url = value
      if (url.startsWith('js://')) {
        url = url.slice(5)
      }

      let [path, exportName] = url.split('#')
      let module: any
      module = await import(resolveModuleUrl(path, baseDir))

      const moduleName = name.startsWith('$') ? name.slice(1) : name
      const handler = exportName
        ? module[exportName]
        : typeof module.default === 'function'
          ? module.default
          : module[moduleName] || module.default

      if (typeof handler !== 'function') {
        throw new Error(`Operator ${name} at ${value} is not a function`)
      }

      if (handler.length === 4) {
        result[name] = handler as ValidationOperatorHandler
      } else {
        result[name] = wrapCustomOperator(handler as CustomOperatorHandler)
      }
    }
  }

  return result
}
