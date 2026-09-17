# @isdk/match-ex

> 【English|[中文](./README.cn.md)】
---

A declarative, weight-aware matching/validation engine: match an *actual* value against an *expectation tree* using operators (`$and`, `$or`, `$contains`, `$each`, ...), JSON Schema, semantic diffs and templates.

Framework-agnostic — usable in plain fixture-driven integration tests, response contract checks and the browser.

> Looking for the full AI test runner (executor, fixtures, YAML, scoring reports)? See [`@isdk/ai-test-runner`](https://github.com/isdk/ai-test-runner.js), which builds on this engine. Its expectation syntax is identical to this one (and it registers the plugins for you), so it doubles as a source of usage examples.

## Table of Contents

- [Why match-ex?](#why-match-ex)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Matching Semantics](#matching-semantics) · [Strict Mode](#strict-mode) · [Templates](#templates) · [JSON Schema Validation](#json-schema-validation) · [Semantic Diffing](#semantic-diffing)
- [Operators](#operators)
- [Scoring & Metadata](#scoring--metadata)
- [Custom Operators](#custom-operators)
- [API Reference](#api-reference)

## Why match-ex?

- **Declarative expectations** — regexes, subsets, operators and custom functions compose into one expectation tree; plain objects mean *partial* matching by default.
- **Weighted scoring, not just pass/fail** — every node can carry a weight, dimensions and red-line (`critical`) rules; the engine returns a graded `MatchResult` with per-path details.
- **Zero heavy dependencies** — the core only depends on `diff`, `lodash-es` and `util-ex`. JSON Schema validation and template interpolation live in tiny opt-in plugins.
- **Isomorphic** — no Node builtins; bundles cleanly for the browser.
- **Semantic failure feedback** — a failed string comparison automatically falls back to a structured diff (chars/words/lines/JSON) instead of just telling you "not equal".

## Architecture

```
@isdk/match-ex            core engine: operators, scoring strategies, diff,
                          template/schema registries (no implementations)
@isdk/match-ex-schema     plugin: Ajv-backed JSON Schema (registers on import)
@isdk/match-ex-template   plugin: {{placeholder}} interpolation (registers on import)
```

The core ships **no template engine and no schema validator**. Both are pluggable:

- Without `@isdk/match-ex-template`, string interpolation of `{{...}}` expectations is unavailable (`getStringTemplate()` throws).
- Without `@isdk/match-ex-schema`, JSON Schema expectations (heuristic detection or `$schema`) throw with a hint to install the plugin.

Importing a plugin registers itself immediately:

```ts
import '@isdk/match-ex-schema'
import '@isdk/match-ex-template'
```

(`@isdk/ai-test-runner` already does this for you, so its behavior is unchanged out of the box.)

## Installation

```bash
# core only
npm install @isdk/match-ex          # or: pnpm add @isdk/match-ex

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
  input: {},                 // fixture-level config (e.g. diff, diffPermissive)
  maxScore: 100,             // score ceiling (default 100)
  scoring: true,             // enable scoring mode
})

// Regex + partial object matching (undeclared keys are ignored)
let r = await validate({ role: 'assistant', content: 'Hello Alice!' },
                       { content: /Hello {{name}}/ }, ctx)
// r.pass === true, r.score === 1

// Operators compose freely: sort, then assert on the first element
r = await validate([3, 1, 2],
  { $sort: { $by: (n: number) => n, $first: { $lte: 1 } } }, ctx)

// Weighted scoring with a red-line penalty
r = await validate('Hello World',
  { $or: [
      { $expect: /Hello/, $meta: { score: 80, critical: true } },
      { $expect: /BadWord/, $meta: { score: { value: -20, critical: true } } },
  ] }, ctx)
// r.score, r.pass, r.details (per-path scores), r.failures
```

`validate()` returns a `MatchResult`:

| Field | Description |
|---|---|
| `score` | Normalized score `0.0 ~ 1.0` (relative to the score allocated by the parent). |
| `pass` | Whether it passed (affected by `critical` red lines and `threshold`). |
| `failures` | `MatchFailure[]`: each entry carries `key` (path), `message`, `expected`, `actual`, plus `diff` for string failures. |
| `details` | `MatchResultDetail[]`: the scoring tree (`key`/`title`/`dimension`/`weight`/`score`/`pass`/`critical`). |
| `title` / `dimension` / `critical` | Metadata of the current node (injected via `$meta` / `$` shorthands). |

### Entry Points

| Export | Description |
|---|---|
| `validate(actual, expected, ctx)` | Main entry. Returns a graded `MatchResult`. |
| `validateMatch(actual, expected, options)` | Legacy wrapper returning only `failures`. Prefer `validate`. |
| `ValidationContext` | Carries matching options (`data`, `input`, `strict`, operators, scoring) through the recursion. |
| `OPERATORS` | Registry of built-in operators (`$and`, `$contains`, …). |
| `@isdk/match-ex/loader` | Subpath with `loadOperators()` / `wrapCustomOperator()` for dynamic operator loading. |

---

## Core Concepts

### Matching Semantics

Dispatch priority for each expected value:

1. **Operators** — a plain object whose (only non-metadata) key is an operator such as `$and`.
2. **RegExp** — tests the stringified actual value.
3. **String** — `actual.includes(expected)` when no diff requirement is set; otherwise falls back to **semantic diff** with character/word/line strategies.
4. **Array** — per-element recursive matching (length check in strict mode).
5. **Function** — `(actual, input) => boolean | ValidationResult | score`.
6. **JSON Schema** — instances of the registered `JsonSchemaType`, or plain objects that pass the `isJsonSchema` heuristic (disable via `ctx.disableHeuristicSchema`).
7. **Object** — per-property recursive matching; keys support dot-paths (`user.name`), and `/regex/` keys match any actual key.
8. **Primitive** — strict equality.

Additional rules:

- **Partial matching**: by default only the properties declared in the expectation are validated — extra keys in the actual object do not fail (`strict` aside).
- **Auto-trim**: string actual values are `trim()`ed before each recursion level.
- **Metadata keys are not validated**: `$meta`, plus the `$score` / `$title` / … shorthands when there is no `$meta`, are stripped; operator keys inside an object are likewise never treated as business fields.

```ts
// dot-path + regex key
await validate(
  { user_42: { profile: { name: 'Alice' } } },
  { '/^user_\\d+$/': { 'profile.name': 'Alice' } },
  ctx
)
```

### Strict Mode

Strict mode is configured through the `strict` option of `ValidationContext` (i.e. `ctx.strict`), which accepts `true | false | 'object' | 'diff' | 'array' | string[]`:

- `object`: keys of the actual object that are not matched by the expectation cause a failure.
- `array`: array lengths must match.
- `diff`: diff is non-permissive (changes not listed in the whitelist fail).
- `true`: all of the above; the array form combines them, e.g. `['object', 'array']`.

```ts
const ctx = new ValidationContext({ strict: ['object', 'array'] })
await validate({ a: 1, b: 2 }, { a: 1 }, ctx) // pass === false (extra key b)
```

### Templates

Expectations are interpolated before matching — including a RegExp's `source`, object **key names** and array items. Variables come from `ctx.data` (plus `ctx.input`, which takes precedence).

- **Pure placeholder substitution**: if a template string consists of a single variable (e.g. `{{user}}`) and the value is an object/array/boolean, the whole template is replaced by that **raw value** rather than its stringified form.
- **Deep recursive resolution**: a substituted value that is itself a template is rendered recursively.
- **Dialects**: `ctx.data.templateFormat` accepts `default | fstring | golang | env | hf`.
- **Plugin dependency**: the implementation is provided by `@isdk/match-ex-template`; without it, `{{...}}` throws.

```ts
const ctx = new ValidationContext({ data: { user: { id: 1, name: 'Alice' } } })
// "{{user}}" → { id: 1, name: 'Alice' } (the object itself, ready for deep matching)
await validate({ id: 1, name: 'Alice' }, '{{user}}', ctx)
// regex template → /Alice/
await validate('Hi Alice', '/{{user.name}}/', ctx)
```

### JSON Schema Validation

Two ways to trigger it (both need the `@isdk/match-ex-schema` plugin):

- **Heuristic detection**: a plain object with a valid `type` (`string`/`number`/`integer`/`boolean`/`object`/`array`/`null`) and no `$contains`/`$all`/`$sequence` key is validated as JSON Schema. Turn it off with `ctx.disableHeuristicSchema = true`.
- **Explicit `$schema` operator**: always validated as JSON Schema.

All [ajv-formats](https://github.com/ajv-validator/ajv-formats) and [ajv-keywords](https://github.com/ajv-validator/ajv-keywords) keywords are available.

```yaml
# explicit
profile:
  $schema:
    type: object
    properties:
      age: { type: number, minimum: 18 }
    required: [age]

# heuristic (a top-level type is enough)
age: { type: number, minimum: 18 }
```

### Semantic Diffing

**Every string comparison in the engine falls back to the diff engine on failure** — even without an explicit `$diff`: when `actual.includes(expected)` fails (or a diff requirement is configured), a structured diff runs and per-item changes are reported in `MatchFailure.diff` instead of a vague "mismatch".

#### Auto Detection

When no `type` is given (or `diff: true` / `diff: 'auto'`), the strategy is detected heuristically:

- Both sides parse as JSON object/array → `json` (path-based, ignoring indentation and key order).
- Either side contains a newline → `lines`.
- Either side is ≥ 20 chars and contains a space → `words`.
- Otherwise → `chars`.

#### Strategy Types

`auto` | `chars` (default fallback) | `words` (whitespace ignored) | `wordsWithSpace` | `lines` | `sentences` | `json`

#### Whitelist & Permissive Mode

Configured through `DiffOptions` (either as the `$diff` operand or via `ctx.input.diff`):

| Option | Description |
|---|---|
| `type` | Diff strategy. |
| `items` | Whitelist of expected changes: `{ value?, path?, val?, added?, removed?, required?, score? }`; `value` may be a regex string. |
| `permissive` | Ignore undeclared changes; only `required: true` items must appear as expected (same as `ctx.diffPermissive`). |
| `ignoreCase` / `ignoreWhitespace` / `ignoreNewlineAtEof` / `newlineIsToken` / `stripTrailingCr` / `intlSegmenter` | Fine-grained options forwarded to the `diff` library. |

```yaml
# only make sure "User" was added — ignore everything else
output: "Hello"
diff:
  permissive: true
  items:
    - { value: "User", added: true, required: true }
```

```yaml
# structured JSON whitelist
diff:
  type: json
  items:
    - path: "user.id"
      val: 123
      added: true
```

> `strict: 'diff'` (or `strict: true`) means non-permissive: any change missing from the whitelist fails.

---

## Operators

### Overview

> An object may contain **only one operator** (besides metadata keys such as `$meta` / `$` shorthands) — combine multiple conditions with `$and` / `$or`.

| Operator | Meaning | Default strategy |
|---|---|---|
| `$and` | All conditions must pass. | `weighted` |
| `$or` | At least one condition passes (highest score wins). | `max` |
| `$not` | Negates the nested expectation. | — |
| `$contains` | Array: contains a matching item · String: substring · Object: partial match. | `max` |
| `$all` | Array contains all expected items, unordered. | `weighted` |
| `$each` | Every element matches the single given rule. | `weighted` |
| `$sequence` | Array contains the items in order (noise allowed in between). | — |
| `$sort` | Sorts by `$by` first, then validates the rest. | — |
| `$nth` / `$first` / `$last` | Extract element by index (negatives supported) and validate it. | — |
| `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` | Comparisons and membership. | — |
| `$expr` | Evaluate a JS expression string. | — |
| `$exists` | Key/value existence. | — |
| `$expect` | Transparent wrapper for attaching metadata to any node. | — |
| `$schema` | Explicit JSON Schema validation (needs the schema plugin). | — |
| `$diff` | Force semantic diff with whitelists/strategies. | — |

### Logic & Collections

- **`$and`**: an array of conditions; the actual value must satisfy **all** of them. The score is the weighted sum.
- **`$or`**: passes when **any** branch passes; the score is the highest weighted branch.
- **`$not`**: fails if the nested expectation matches, passes otherwise. Handy for blacklists: `$not: /badword/`.
- **`$contains`**: adapts to the target type — array "at least one item matches", string "substring", object "partial match".
- **`$all`**: the array must contain **all** expected items, in **any order**; extra elements are allowed.
- **`$each`**: **every** element must match the given **single** rule; an empty array passes; weights are spread evenly across elements.
- **`$sequence`**: the items must appear **in order**; unrelated items may be interleaved. Ideal for multi-step call chains.
- **`$exists`**: existence check (see below).

```yaml
$and:
  - "/^Hello/"          # must start with Hello
  - { $not: "/World/" } # and must not contain World
```

```yaml
# "or" over a list of messages
$or:
  - $contains: { role: 'assistant', tools: [{ name: 'get_user' }] }
  - $contains: { role: 'assistant', tools: [{ name: 'find_person' }] }
```

```yaml
# ordered: first get_user, then send_email (other steps allowed in between)
$sequence:
  - { role: 'assistant', tools: [{ name: 'get_user' }] }
  - { role: 'assistant', tools: [{ name: 'send_email' }] }
```

**`$exists` has three modes:**

| Form | Meaning |
|---|---|
| `$exists: true` / `false` | Shorthand: value is not `undefined` (`null` counts as absent). |
| `$exists: { $value: true, nullAsAbsent: true }` | `null` counts as present — only `undefined` is absent. |
| `$exists: { $value: false, strict: true }` | Strict: the key must be **physically absent** from the parent object (combinable with `nullAsAbsent`). |

### Array Processing & Transformation

- **`$sort`**: sorts the actual array first, then applies the **remaining expectations** to the sorted array (streaming wrapper).
  - **`$by`** accepts four formats:
    - **string**: property name, with a `-` prefix for descending (e.g. `"-score"`).
    - **function**: `(item, index, array) => value` (async supported).
    - **expression object**: `{ "$expr": "item.score * 1.2", "order": "desc" }` with `item` (`actual` is an alias), `index`, `array`, `data`, `input` and `ctx` in scope.
    - **array**: any combination of the above for multi-level sorting.
- **`$nth`**: validates only the element at `$index` (default `0`, negatives like `-1` supported); out-of-range or empty arrays fail immediately.
- **`$first`** / **`$last`**: sugar for `$nth` with `$index: 0` / `-1`.

```yaml
$sort:
  $by:
    - { $expr: "item.score * 1.2", order: "desc" }
    - "-createdAt"
  $first: { status: "success" }
```

```yaml
$nth: { $index: 1, status: "success" }
```

### Comparisons

- **`$eq` / `$ne`**: strict equality / inequality.
- **`$gt` / `$gte` / `$lt` / `$lte`**: ordering — handy for thresholds, scores and length constraints.
- **`$in` / `$nin`**: the actual value is / is not one of the given array values.

```yaml
# only one operator per level — combine conditions with $and
score: { $and: [{ $gte: 60 }, { $lt: 100 }] }
status: { $in: ['active', 'pending'] }
```

### The `$expr` Operator

Write a JavaScript expression string for cross-field, arithmetic or async decisions.

Scope variables:

| Variable | Description |
|---|---|
| `actual` | The actual value being validated. |
| `expected` | The current expectation (i.e. the expression string itself). |
| `data` | `ctx.data` (template variables). |
| `fixture` | `ctx.input` (fixture-level config). |
| `ctx` | The current `ValidationContext`; `ctx.actual` is the root actual value. |
| `loop` | Only inside array operators (`$each`, `$contains`, `$all`, `$sequence`): `{ index, first, last, length }`. |

Return value semantics: `boolean` → 1/0; `number` → confidence (judged against `threshold`); `{ pass?, score?, ... }` → used as-is; anything else is coerced to boolean. A thrown expression is reported as the failure reason.

```yaml
# stand-ins for the missing $length / $keys / $values operators
$expr: "actual.length === 5"
# multi-property condition
$expr: "actual.price * actual.quantity >= 500 && data.userRole === 'admin'"
# use `loop` for first/rest assertions
$each: { $expr: "loop.first ? actual.status === 'init' : actual.status === 'done'" }
```

### Special Operators

- **`$expect`**: transparent container that delegates to its value — used purely to attach scoring metadata (weight, red line, title, dimension) to any node.
- **`$schema`**: explicit JSON Schema validation.
- **`$diff`**: force semantic diffing with a given strategy/whitelist; the operand may be a string or `{ value | expected, type, items, permissive, ... }`.

---

## Scoring & Metadata

### Core Options (`ValidationContext`)

| Option | Description |
|---|---|
| `scoring` | `true | false | 'auto'` — enables scoring mode (affects diff scoring and the best-branch search in `$contains`). |
| `maxScore` | Score ceiling, default `100`; also the scale used for weight normalization. |
| `passScore` | Passing threshold, defaults to `maxScore`. The engine only carries it through — whether a run passes is decided by the caller (e.g. `ai-test-runner`). |
| `unassignedWeight` | Alias of `totalUnassignedWeight`: budget reserved for all items without an explicit `score`. Defaults to `0.1`. |
| `autoConfidence` | Defaults to `true`: weights between `0` and `1` are treated as confidence (percentages); `'force'` skips the heuristic. |
| `threshold` | Confidence threshold for fuzzy matching (leaf nodes) — a lower score fails. |
| `allocatedScore` | Score budget allocated by the parent to this node; defaults to `maxScore`. |
| `strategy` | The active `ScoringStrategy` (defaults to `weighted` when unset). |

### Hierarchical Relative Weights

Scoring follows a **"allocate top-down, aggregate bottom-up"** model:

- **Weight normalization**: siblings at the same level compete for the parent's `allocatedScore`.
- **Automatic scale**: `0~1` is read as a percentage, `>= 1` as absolute points, converted with `scale = max(maxScore, largest explicit weight)`.
- **Unassigned items**: share the `totalUnassignedWeight` budget (when space is short, explicit items are compressed to keep that budget).
- **Negative scores (penalties)**: do not compete for the `1.0` budget of positive items — they are converted to a negative weight directly.

### `$meta` and `$` Shorthands

> **⚠️ Note**: `score`, `title`, `critical`, `description`, `dimension` and friends are **business data**; all metadata must be declared through the `$meta` container or `$`-prefixed shorthand keys.
> The two are **mutually exclusive**: once `$meta` is present, `$` shorthand keys are no longer metadata (they are ignored), which keeps business field names safe.

**Recommended: the explicit `$meta` container** (keeps the top-level namespace clean so you can still validate same-named fields)

```yaml
someField:
  score: 100         # business data: the output must contain a `score` field
  $meta:
    score: 80        # metadata: the weight of this check
    title: "Core field"
```

**Shorthand: `$` prefixes** (only when the object has **no** `$meta`)

```yaml
$score: 80              # number: weight (0~1 = percentage, >= 1 = absolute points)
$title: "Core field"
```

```yaml
$score: { value: -20, critical: true }   # object: penalty + red line
$title: "Security penalty"
$dimension: 'security'  # (optional) dimension tag (may also live inside $score)
$critical: true         # (optional) red line
$strategy: 'weighted'   # (optional) aggregation strategy for children
$threshold: 0.75        # (optional) confidence threshold for fuzzy matching
$description: '...'     # (optional) description
```

### Penalties & Red Lines

- Negative values are **penalty offsets**: a penalty **matching** means points are deducted.
- When a matched penalty is marked `critical`, the whole match fails (red line) and a virtual `critical` failure is emitted so you can tell which red line was hit.
- A reward item (`weight >= 0`) that fails makes the aggregate fail.

### Scoring Strategies

| Strategy | Aggregation | Used by default in |
|---|---|---|
| `weighted` (alias `and`) | `score = Σ(child.score × child.weight)`, every reward must pass | `$and`, objects, arrays, `$each`, `$all` |
| `max` (alias `or`) | `score = max(child.score × child.weight)`, any pass is a pass | `$or`, `$contains` |

- Priority: **operator-declared `strategy`** (e.g. `$or.strategy = 'max'`, which keeps operator semantics intact) > **user `$strategy` (or `$meta.strategy`)** > **inherited `ctx.strategy`**.
- Strategies are referenced by name: `weighted` / `and`, `max` / `or`; unknown names fall back to `weighted` (the `strategies` registry and `getStrategy()` are currently internal and not exported from the core entry).

### `$expect`: The Scoring Wrapper

`$expect` is a virtual container you can use anywhere to inject scoring metadata:

```yaml
output:
  $and:
    - $expect: /spring/
      $meta: { score: 80, dimension: 'accuracy', critical: true, title: "Core keyword" }
    - $expect: /flower/
      $score: 20
      $threshold: 0.5   # fails if the match confidence is below 50%
    - $expect: /badword/
      $score: { value: -50, dimension: 'security' }
      $title: "Security penalty"
```

### `$diff`: Scoring Each Change

Score each item of a diff whitelist (requires `scoring`):

```yaml
$diff:
  items:
    - value: "core conclusion"
      added: true
      $score: { value: 90, critical: true }
    - value: "filler word"
      added: true
      $score: 10
  permissive: true   # score only by the whitelist; ignore other changes
```

---

## Custom Operators

### Inline Operators

Register them via `ctx.operators`; keys are conventionally `$`-prefixed (consistent with the built-ins):

```ts
import { ValidationContext, validate } from '@isdk/match-ex'
import { wrapCustomOperator } from '@isdk/match-ex/loader'

const ctx = new ValidationContext({
  operators: {
    $length: wrapCustomOperator((actual, expected) => actual?.length === expected),
  },
})
await validate('abc', { $length: 3 }, ctx)
```

> Like `loadOperators`, `wrapCustomOperator` lives behind the `@isdk/match-ex/loader` subpath (the core entry deliberately does not export it).

`wrapCustomOperator` adapts the **simplified signature** `(actual, expected, fixture)`, where `fixture` exposes:

| Property | Description |
|---|---|
| `$data` | The `ctx.data` object. |
| `$options` | Auxiliary parameters coming from the `expected.$value` wrapper (see below). |
| `$validate` | `(act, exp) => validate(act, exp, ctx)` for recursive reuse of the engine. |
| rest | `ctx.input` is spread in (placed under `input` when it is not an object). |

### Return Value Mapping

| Return type | Mapping | Use case |
|---|---|---|
| `boolean` | `true` → score 1.0, passed; `false` → 0.0, failed. | Simple true/false assertions. |
| `string` | Treated as the failure message: score 0.0, failed. | Assertions needing a concrete reason. |
| `number` | `0.0 ~ 1.0` confidence; pass/fail determined by `threshold`. | Fuzzy / similarity matching. |
| `Object` | Must contain `score` or `pass` (or `failures`); may add `message`, `dimension`, `details`. | Dimension info or a custom failure list. |

### The `$value` Convention: Value vs. Options

When a `$value` structure is used, `$value` becomes `expected` and every sibling property is collected into `fixture.$options`:

```yaml
output:
  $checkCode:
    $value: "function sum"   # main expectation → expected
    timeout: 1000            # auxiliary options → fixture.$options
    strict: true
```

```js
export function checkCode(actual, expected, fixture) {
  const { timeout, strict } = fixture.$options
  // expected === "function sum"
}
```

### Logic Container Operators

Operators that validate several children (a custom `$and`, say) use the **full signature** `(actual, expected, ctx, validate)` and the `ValidationContext` helpers:

```js
export async function myContainer(actual, expectedList, ctx, validate) {
  const weights = ctx.distribute(expectedList)              // automatic weight allocation
  const results = []
  for (let i = 0; i < expectedList.length; i++) {
    const subCtx = ctx.createChildContext(i, expectedList.length) // automatic paths
    results.push(await validate(actual[i], expectedList[i], subCtx))
  }
  return ctx.aggregate(results, weights)   // applies myContainer.strategy
}

myContainer.virtual = true
myContainer.strategy = 'weighted'   // lock to the weighted-sum strategy
```

- The full signature (4 parameters) is used as-is; the simplified one (≤ 3 parameters) is wrapped by `wrapCustomOperator`.
- `ctx.distribute(items)`: normalizes a list of `ScoreConfig` into weights using the active strategy.
- `ctx.aggregate(results, weights)`: aggregates with the active strategy and fills in `details`.
- `ctx.createChildContext(keyOrIndex, count, options)`: handles path levels automatically.

### Virtual Path Strategy (`virtual`)

An operator declares how it appears in the scoring tree through its `virtual` property, following a **"default virtual"** rule:

| Value | Behavior |
|---|---|
| `true` (default) | Virtual: fully transparent for a single child (it inherits the parent path); readable branches such as `$and[0]` are generated for multiple children. |
| `false` | Physical: keeps the operator level (e.g. `output.$myOp`), children land under `[index]`. |
| `string` | Custom path template with `$key`, `$index`, `$count` and `$operator` variables (e.g. `$operator[$key]`). |

### Dynamic Loading with `loadOperators`

String-based operator modules load through the `@isdk/match-ex/loader` subpath (the core entry deliberately omits it, since the runtime-computed dynamic `import()` cannot be analyzed by bundlers):

```ts
import { loadOperators } from '@isdk/match-ex/loader'

const operators = await loadOperators({
  $len: 'js://./my-operators.js#checkLength',  // path#exportName
  checkCode: './checkers.js#checkCode',        // the $ prefix is added automatically
}, baseDir)

// array form: names are inferred (export name first, otherwise the camelCased filename)
const ops = await loadOperators(['./checkers.js#checkCode', 'my-test-utils#validator'], baseDir)
```

- The `js://` protocol prefix is optional (it is the default).
- Relative paths resolve against the second argument, `baseDir` (passed through untouched when omitted).
- Absolute paths and bare npm specifiers (e.g. `lodash-es#isEqual`) work too; the part after `#` is the export name, defaulting to `default`.
- Loaded functions are again classified by parameter count (full vs. simplified signature).

### Related Options

- **`allowOperatorOverride`**: defaults to `false` (built-ins win). Set to `true` to let custom operators override built-ins such as `$contains`.
- **`ctx.operators`**: the inline operator map; keys should start with `$` — `loadOperators()` adds the missing prefix automatically.

---

## API Reference

### Exports

| Export | Description |
|---|---|
| `validate(actual, expected, ctx)` | Main entry; returns a `MatchResult`. |
| `validateMatch(actual, expected, options)` | Legacy wrapper returning `failures` (also pushed into `options.failures`). |
| `ValidationContext` | Context class: `createSubContext(subKey, options)`, `createChildContext(keyOrIndex, count, options)`, `distribute(items)`, `aggregate(results, weights)`. |
| `OPERATORS` | Registry of built-in operators. |
| `isStrict(type, strict)` | Strict-mode helper. |
| `getDiff(expected, actual, options)` | Produces `DiffItem[]`. |
| `validateStringDiff(actual, expected, ctx, options)` | String diff validation (whitelist / scoring). |
| `hasDiffChanges(diff)` | Whether the diff contains additions/removals. |
| `formatTemplate(value, options)` / `formatObject(input, options)` | Template interpolation (single value / recursive over objects and keys). |
| `setStringTemplate(impl)` / `getStringTemplate()` | Register / read the interpolation implementation (contract: `{ formatIf(options) }`). |
| `setJsonSchemaType(ctor)` / `getJsonSchemaType()` / `resolveJsonSchemaType()` | Register / read the JSON Schema implementation. |
| `isJsonSchema(obj)` | Heuristic detection of plain-object JSON Schemas. |
| `JsonSchemaType` | Abstract base class for custom validators (`create(schema)` / `validate(value)` / `getErrors()`). |
| `calculateNormalizedWeights(weights, options)` | Core weight normalization (mixing percentages and absolute points). |
| `getScoreConfig(item)` / `isMetadataKey(key, item)` | Metadata helpers. |
| `@isdk/match-ex/loader` | `loadOperators()`, `wrapCustomOperator()`, `resolveModuleUrl()`. |

### `ValidationContext` Options

| Option | Default | Description |
|---|---|---|
| `key` | `''` | Current path (maintained by the engine). |
| `data` | `{}` | Template variables (may contain `templateFormat`). |
| `input` | — | Fixture-level config; merged into the template variables. Its `diff` / `diffPermissive` are read by the diff engine. |
| `strict` | — | Strict mode: `true`\|`false`\|`'object'`\|`'diff'`\|`'array'`\|`string[]`. |
| `diffPermissive` | — | Global permissive diff. |
| `disableHeuristicSchema` | `false` | Disable JSON Schema heuristic detection. |
| `operators` | — | Custom operator map. |
| `allowOperatorOverride` | `false` | Allow overriding built-in operators. |
| `scoring` | — | Scoring mode switch. |
| `maxScore` / `passScore` | `100` / `maxScore` | Score ceiling and passing score. |
| `unassignedWeight` | `0.1` | Weight budget for unassigned items. |
| `allocatedScore` | `maxScore` | Score budget of the current node. |
| `strategy` | `weighted` | Scoring strategy instance. |
| `threshold` / `autoConfidence` | — | Confidence threshold / automatic percentage-weight detection. |
| `loop` | — | Array iteration info (`{ index, first, last, length }`). |
| `actual` | — | Root actual value (for `$expr` / custom operators). |

### Core Types

```ts
interface MatchResult {
  score: number            // 0.0 - 1.0
  pass: boolean
  failures: MatchFailure[] // { key?, message?, expected?, actual?, diff?, critical? }
  details?: MatchResultDetail[]
  title?: string
  dimension?: string
  critical?: boolean
}

interface MatchResultDetail {
  key: string              // path
  title?: string
  dimension?: string
  score: number            // score relative to the allocated weight
  weight: number           // normalized weight
  pass: boolean
  critical?: boolean
  details?: MatchResultDetail[]
}
```

---

## Development

```bash
pnpm test      # vitest
pnpm build     # tsup (ESM + CJS + dts)
```

## License

MIT © Riceball Lee
