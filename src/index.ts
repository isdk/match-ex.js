export * from './types.js'
export * from './utils.js'
export * from './template.js'
export * from './schema.js'
export * from './schema-type.js'
export * from './diff.js'
export * from './operators.js'
export * from './core.js'

// NOTE: './loader.js' is NOT re-exported from the main barrel on purpose.
// It resolves operator modules via a runtime-computed dynamic import(),
// which bundlers cannot analyze. Keeping it behind the `@isdk/match-ex/loader`
// subpath entry keeps that out of the import graph of consumers that never
// load custom operators. Import it explicitly:
//   import { loadOperators } from '@isdk/match-ex/loader'
//
// NOTE: the Ajv-backed schema implementation moved to the
// `@isdk/match-ex-schema` plugin package, and the template engine to
// `@isdk/match-ex-template`. Both register themselves into the core registry
// on import, keeping the core dependency-free (diff, lodash-es, util-ex only).
