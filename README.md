# @isdk/match-ex

> 【English|[中文](./README.cn.md)】
---

A declarative, weight-aware matching/validation engine: match an *actual* value against an *expectation tree* using operators (`$and`, `$or`, `$contains`, `$each`, ...), JSON Schema, semantic diffs and templates.

Framework-agnostic — usable in plain fixture-driven integration tests, response contract checks and the browser.

> Looking for the full AI test runner (executor, fixtures, YAML, scoring reports)? See [`@isdk/ai-test-runner`](https://github.com/isdk/ai-test-runner.js), which builds on this engine.

## Why match-ex?

- **Declarative expectations** — regexes, subsets, operators and custom functions compose into one expectation tree; plain objects mean *partial* matching by default.
- **Weighted scoring, not just pass/fail** — every node can carry a weight, dimensions and red-line (`critical`) rules; the engine returns a graded `MatchResult` with per-path details.
- **Zero heavy dependencies** — the core only depends on `diff`, `lodash-es` and `util-ex`. JSON Schema validation and template interpolation live in tiny opt-in plugins.
- **Isomorphic** — no Node builtins; bundles cleanly for the browser.

## Architecture

```
@isdk/match-ex            core engine: operators, scoring strategies, diff,
                          template/schema registries (no implementations)
@isdk/match-ex-schema     plugin: Ajv-backed JSON Schema (registers on import)
@isdk/match-ex-template   plugin: {{placeholder}} interpolation (registers on import)
```

The core ships **no template engine and no schema validator**. Both are pluggable:

- Without `@isdk/match-ex-template`, string interpolation of `{{...}}` expectations is unavailable (`getStringTemplate()` throws).
- Without ``@isdk/match-ex-schema`, JSON Schema expectations (heuristic detection or `$schema`) throw with a hint to install the plugin.

Importing a plugin registers itself immediately:

```ts
import '@isdk/match-ex-schema'
import '@isdk/match-ex-template'
```

(`@isdk/ai-test-runner` already does this for you, so its behavior is unchanged out of the box.)

## Installation

```bash
# core only
npm install @isdk/match-ex

# with plugins
npm install @isdk/match-ex @isdk/match-ex-schema @isdk/match-ex-template
```

## Quick Start

```ts
import { validate, ValidationContext } from '@isdk/match-ex'
import '@isdk/match-ex-schema'    // optional: JSON Schema support
import '@isdk/match-ex-template'  // optional: {{template}} support

const ctx = new ValidationContext({
  data: { name: 'Alice' },   // template variables
  input: {},                  // fixture-level config (e.g. strict, diff)
})

// Regex + partial object matching
let r = await validate({ role: 'assistant', content: 'Hello Alice!' },
                       { content: /Hello {{name}}/ }, ctx)
// r.pass === true, r.score === 1

// Operators compose freely
r = await validate([3, 1, 2],
  { $sort: { $by: '-.', $first: { $lte: 1 } } }, ctx)

// Weighted scoring with a red-line penalty
r = await validate('Hello World',
  { $or: [
      { $expect: /Hello/, $meta: { score: 80, critical: true } },
      { $expect: /BadWord/, $meta: { score: { value: -20, critical: true } } },
  ] }, ctx)
// r.score, r.pass, r.details (per-path scores), r.failures
```

### Entry Points

| Export | Description |
|---|---|
| `validate(actual, expected, ctx)` | Main entry. Returns a graded `MatchResult` (`{ score, pass, failures, details }`). |
| `validateMatch(actual, expected, options)` | Legacy wrapper returning only `failures`. Prefer `validate`. |
| `ValidationContext` | Carries matching options (`data`, `input`, `strict`, operators, strategy) through the recursion. |
| `@isdk/match-ex/loader` | Subpath with `loadOperators()` / `wrapCustomOperator()` for dynamic operator loading. |

## Matching Semantics

Dispatch priority for each expected value:

1. **Operators** — a plain object whose (only non-metadata) key is an operator such as `$and`.
2. **RegExp** — tests the stringified actual value.
3. **String** — `actual.includes(expected)` when no diff requirement is set; otherwise falls back to **semantic diff** with character/word/line strategies.
4. **Array** — per-element recursive matching (length check in strict mode).
5. **Function** — `(actual, input) => boolean | ValidationResult | score`.
6. **JSON Schema** — instances of the registered `JsonSchemaType`, or plain objects that pass the `isJsonSchema` heuristic (disable via `ctx.disableHeuristicSchema`).
7. **Object** — per-property recursive matching; keys support dot-paths (`user.name`), and `/regex/` keys match any actual key.
8. **Primitive** — strict equality.

### Strict Mode

`ctx.input.strict` accepts `true | false | 'object' | 'diff' | 'array' | string[]`:

- `object`: extra keys in the actual object fail the test.
- `array`: array lengths must match.
- `diff`: diff is non-permissive (unlisted changes fail).

## Operators

| Operator | Meaning |
|---|---|
| `$and` | All conditions must pass (weighted-sum aggregation). |
| `$or` | At least one condition passes (max-score aggregation). |
| `$not` | Negates the nested expectation. |
| `$contains` | Array: contains a matching item · String: substring · Object: partial match. |
| `$all` | Array contains all expected items, unordered. |
| `$each` | Every element matches the single given rule. |
| `$sequence` | Array contains the items in order (noise allowed in between). |
| `$sort` | Sorts the actual array by `$by` (field, function or `$expr`, `-field` = desc) before validating the rest. |
| `$nth` / `$first` / `$last` | Extract element by index (negatives supported) and validate it. |
| `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` | Comparisons and membership. |
| `$expr` | Evaluate a JS expression string with `actual`, `expected`, `data`, `fixture`, `loop`, `ctx` in scope; result may be boolean/number/result object. |
| `$exists` | Key/value existence; `{ $value: false, strict: true }` requires physical absence. |
| `$expect` | Transparent wrapper for attaching metadata to any node. |
| `$schema` | Explicit JSON Schema validation (needs the schema plugin). |
| `$diff` | Force semantic diff with whitelists/strategies. |

## Scoring & Metadata

Attach metadata to any node via the `$meta` container or `$`-shorthands (`$score`, `$critical`, `$title`, `$description`, `$dimension`, `$strategy`, `$threshold`):

```yaml
someField:            # business data wins — no $meta here
  score: 100          # validated as a normal field
status:
  $expect: 'ok'       # shorthand metadata below
  $score: 80
  $title: 'Core field'
keywords:
  $expect: /Spring/
  $meta: { score: { value: -20, critical: true }, dimension: 'security' }
```

- **Weights** are relative within a level; unassigned siblings share the remaining budget. Percentages and integer points both work.
- **Negative scores** are penalties — a matching *critical* penalty forces an overall fail (red-line).
- **Strategies**: `weighted` (default for `$and`/objects/arrays) and `max` (default for `$or`). Select per node via `$strategy`, or look up with `getStrategy()`.

The returned `MatchResult.details` is a tree of `{ key, title, dimension, weight, score }` entries — one per path — alongside `failures` for reporting.

## Custom Operators

Inline handler:

```ts
import { ValidationContext, validate, wrapCustomOperator } from '@isdk/match-ex'

const ctx = new ValidationContext({
  operators: {
    $length: wrapCustomOperator((actual, expected) =>
      actual?.length === expected),
  },
})
await validate('abc', { $length: 3 }, ctx)
```

The simplified handler receives `(actual, expected, fixture)` where `fixture` exposes `$data`, `$options` (from an `expected.$value` wrapper) and `$validate` for recursive matching. Return a `ValidationResult`, a boolean, or a numeric score.

Dynamic (string) operator modules are supported through the `@isdk/match-ex/loader` subpath:

```ts
import { loadOperators } from '@isdk/match-ex/loader'
const operators = await loadOperators({
  $len: 'js://./my-operators.js#checkLength', // path#export
})
```

## Template & Schema Registries

| Function | Purpose |
|---|---|
| `setStringTemplate(impl)` / `getStringTemplate()` | Register/read the interpolation implementation (`{ formatIf(options) }`). |
| `setJsonSchemaType(ctor)` / `getJsonSchemaType()` / `resolveJsonSchemaType()` | Register/read the JSON Schema implementation. |
| `isJsonSchema(obj)` | Heuristic detection of plain-object JSON Schemas. |
| `JsonSchemaType` | Abstract base class to implement your own validator. |

See the plugin packages [`@isdk/match-ex-schema`](https://github.com/isdk/match-ex-schema.js) and [`@isdk/match-ex-template`](https://github.com/isdk/match-ex-template.js) for reference implementations.

## Development

```bash
pnpm test      # vitest
pnpm build     # tsup (ESM + CJS + dts)
```

## License

MIT © Riceball Lee
