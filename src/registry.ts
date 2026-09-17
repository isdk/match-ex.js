import type { StringTemplateLike } from './template.js'
import type { JsonSchemaTypeCtor } from './schema.js'

/**
 * The set of pluggable implementations the engine can use.
 *
 * The core ships none of them: template interpolation comes from
 * `@isdk/match-ex-template` and JSON Schema validation from
 * `@isdk/match-ex-schema`. Both register themselves here on import.
 */
export interface MatchExRegistry {
  /** Registered template implementation, if any. */
  stringTemplate?: StringTemplateLike
  /** Registered `JsonSchemaType` implementation, if any. */
  jsonSchemaType?: JsonSchemaTypeCtor
}

/**
 * Well-known key used to store the registry on `globalThis`.
 *
 * Why not a plain module-level variable: duplicate copies of this module are
 * common — `src` vs `dist` inside this repo's own test suite, or two
 * semver-incompatible resolutions in a consumer's dependency tree. With a
 * module-local variable a plugin registering into copy A is invisible to copy
 * B, and the engine then reports "not registered" even though the plugin was
 * imported. `Symbol.for()` + `globalThis` makes every copy share one registry.
 */
export const REGISTRY_KEY = Symbol.for('@isdk/match-ex/registry')

/**
 * Returns the shared plugin registry, creating it on first use.
 */
export function getRegistry(): MatchExRegistry {
  const g = globalThis as any
  let reg: MatchExRegistry = g[REGISTRY_KEY]
  if (!reg) {
    reg = {} as MatchExRegistry
    g[REGISTRY_KEY] = reg
  }
  return reg
}
