import { MatchFailure } from './types.js'
import { ValidationContext, MatchResult } from './types.js'
import { JsonSchemaType } from './schema-type.js'
import { getRegistry } from './registry.js'

/**
 * Constructor shape of a concrete {@link JsonSchemaType} implementation.
 */
export type JsonSchemaTypeCtor = typeof JsonSchemaType & {
  create(schema?: any): JsonSchemaType
}

/**
 * Registers the concrete `JsonSchemaType` implementation to use
 * (e.g. the Ajv-backed `AjvSchemaType` from `@isdk/match-ex-schema`).
 *
 * Passing `undefined`/`null` unregisters it: heuristic schema detection then
 * degrades to plain object matching instead of failing (see `core.ts`).
 */
export function setJsonSchemaType(
  ctor: JsonSchemaTypeCtor | undefined | null
): void {
  getRegistry().jsonSchemaType = ctor || undefined
}

/** Returns the registered schema type implementation, if any. */
export function getJsonSchemaType(): JsonSchemaTypeCtor | undefined {
  return getRegistry().jsonSchemaType
}

/**
 * Returns the registered concrete schema implementation.
 *
 * The engine ships none — the Ajv-backed one lives in the
 * `@isdk/match-ex-schema` plugin package, which registers itself on import:
 *
 * ```ts
 * import '@isdk/match-ex-schema'
 * ```
 *
 * @throws If no implementation was registered before the first schema
 * validation.
 */
export function resolveJsonSchemaType(): JsonSchemaTypeCtor {
  const ctor = getJsonSchemaType()
  if (!ctor) {
    throw new Error(
      'JSON Schema validation requires a registered schema type. ' +
        'Register one via setJsonSchemaType(), e.g. by importing ' +
        '"@isdk/match-ex-schema".'
    )
  }
  return ctor
}

/** Standard JSON Schema primitive types. */
const JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])

/**
 * Keywords that may appear in a JSON Schema node (draft-07/2019-09/2020-12
 * core + validation + applicator vocabularies, plus the `ajv-keywords`
 * vocabulary used by `@isdk/match-ex-schema`).
 *
 * Used by {@link isJsonSchema} to tell a real schema apart from a plain
 * expectation object that merely happens to carry a `type` field
 * (`{type: 'object', name: 'x'}` must be *matched*, not compiled).
 */
const JSON_SCHEMA_KEYWORDS = new Set([
  // core
  '$schema', '$id', '$ref', '$anchor', '$comment', '$defs', '$dynamicRef',
  '$dynamicAnchor', '$vocabulary', 'definitions',
  // metadata
  'title', 'description', 'default', 'deprecated', 'readOnly', 'writeOnly',
  'examples',
  // combinators / conditionals
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
  // type-specific validation
  'type', 'enum', 'const',
  'multipleOf', 'maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum',
  'maxLength', 'minLength', 'pattern', 'format',
  'items', 'prefixItems', 'additionalItems', 'contains', 'maxItems',
  'minItems', 'uniqueItems', 'maxContains', 'minContains',
  'unevaluatedItems',
  'properties', 'patternProperties', 'additionalProperties',
  'propertyNames', 'required', 'maxProperties', 'minProperties',
  'dependentRequired', 'dependentSchemas', 'dependencies',
  'unevaluatedProperties',
  // content / openapi-ish extras
  'contentEncoding', 'contentMediaType', 'contentSchema', 'discriminator',
  'nullable', 'example',
  // ajv-keywords
  'typeof', 'instanceof', 'range', 'exclusiveRange', 'regexp', 'transform',
  'prohibited', 'deepProperties', 'deepRequired', 'patternRequired',
  'allRequired', 'anyRequired', 'oneRequired', 'uniqueItemProperties',
  'select', 'dynamicDefaults',
])

/** Keywords that alone identify a schema, even without a `type` field. */
const SCHEMA_ROOT_KEYWORDS = ['$ref', 'allOf', 'anyOf', 'oneOf', 'not', 'if']

function isJsonSchemaType(value: any): boolean {
  if (typeof value === 'string') return JSON_SCHEMA_TYPES.has(value)
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((v) => typeof v === 'string' && JSON_SCHEMA_TYPES.has(v))
  }
  return false
}

/**
 * Heuristically determines if a given value should be treated as a JSON Schema.
 *
 * Two conditions must hold:
 * 1. it declares a JSON Schema `type` (or a schema-only root keyword such as
 *    `$ref` / `allOf`);
 * 2. **every** key is a known JSON Schema keyword — otherwise it is a plain
 *    expectation object, an operator object (`{$and: [...], type: 'string'}`)
 *    or a domain object (`{type: 'object', name: 'x'}`) that must be matched
 *    literally.
 *
 * @param expected - The value to check.
 * @returns True if the value appears to be a JSON Schema.
 */
export function isJsonSchema(expected: any): boolean {
  if (JsonSchemaType.isInstance(expected)) return true
  if (typeof expected !== 'object' || expected === null || Array.isArray(expected)) {
    return false
  }
  const keys = Object.keys(expected)
  if (keys.length === 0) return false

    /**
   * `$schema` 只有在取值为字符串（Schema URI，如
   * `http://json-schema.org/draft-07/schema#`）时才算 Schema 特征；
   * 取值为对象时它是 `$schema` 算子（`{$schema: {...}}`）。
   */
  const isSchemaRoot = isJsonSchemaType(expected.type) ||
    typeof expected.$schema === 'string' ||
    SCHEMA_ROOT_KEYWORDS.some((k) => keys.includes(k))
  if (!isSchemaRoot) return false

  return keys.every((k) => JSON_SCHEMA_KEYWORDS.has(k))
}

/**
 * Validates a value against a JSON Schema.
 * Uses `YamlTypeJsonSchema` for validation and error reporting.
 *
 * @param actual - The actual value to validate.
 * @param expected - The JSON Schema (object or YamlTypeJsonSchema instance).
 * @param ctx - The validation context.
 * @returns A promise resolving to the MatchResult.
 */
export async function validateJsonSchema(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  let schema: JsonSchemaType | undefined
  const failures: MatchFailure[] = []

  if (JsonSchemaType.isInstance(expected)) {
    schema = expected
  } else {
    // Resolving the implementation must stay outside the try/catch below:
    // a missing registration is a hard error, not an invalid schema.
    const Ctor = resolveJsonSchemaType()
    try {
      schema = Ctor.create(expected)
    } catch (e: any) {
      /**
       * 【不可编译的 Schema 必须失败，而不是静默通过】
       * 之前这里只 console.error 然后落到 `return {score: 1, pass: true}`，
       * 导致写错的 schema（如非法的 pattern 正则）被判定为满分通过。
       */
      return {
        score: 0,
        pass: false,
        failures: [
          {
            key: ctx.key,
            message: `Invalid JSON Schema: ${e?.message ?? e}`,
            expected,
            actual,
          },
        ],
      }
    }
  }

  if (schema) {
    const valid = schema.validate(actual)
    if (!valid) {
      const errors = schema.getErrors()!
      failures.push({
        key: ctx.key,
        message: 'JSON Schema validation failed',
        expected: errors,
        actual,
      })
      return { score: 0, pass: false, failures }
    }
  }
  return { score: 1, pass: true, failures }
}
