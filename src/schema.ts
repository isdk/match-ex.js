import { MatchFailure } from './types.js'
import { ValidationContext, MatchResult } from './types.js'
import { JsonSchemaType } from './schema-type.js'

/**
 * Constructor shape of a concrete {@link JsonSchemaType} implementation.
 */
export type JsonSchemaTypeCtor = typeof JsonSchemaType & {
  create(schema?: any): JsonSchemaType
}

let _schemaCtor: JsonSchemaTypeCtor | undefined

/**
 * Registers the concrete `JsonSchemaType` implementation to use
 * (e.g. the Ajv-backed `AjvSchemaType` from `@isdk/match-ex-schema`).
 */
export function setJsonSchemaType(ctor: JsonSchemaTypeCtor): void {
  _schemaCtor = ctor
}

/** Returns the registered schema type implementation, if any. */
export function getJsonSchemaType(): JsonSchemaTypeCtor | undefined {
  return _schemaCtor
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
  if (!_schemaCtor) {
    throw new Error(
      'JSON Schema validation requires a registered schema type. ' +
        'Register one via setJsonSchemaType(), e.g. by importing ' +
        '"@isdk/match-ex-schema".'
    )
  }
  return _schemaCtor
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
 * Heuristically determines if a given value should be treated as a JSON Schema.
 * It checks for the presence of a 'type' property with a valid JSON Schema type
 * and the absence of custom operators.
 *
 * @param expected - The value to check.
 * @returns True if the value appears to be a JSON Schema.
 */
export function isJsonSchema(expected: any): boolean {
  if (JsonSchemaType.isInstance(expected)) return true
  if (typeof expected === 'object' && expected !== null && expected.type) {
    if (
      typeof expected.type === 'string' &&
      JSON_SCHEMA_TYPES.has(expected.type)
    ) {
      const keys = Object.keys(expected)
      // Basic heuristic to distinguish from other objects (like operators)
      return keys.every((k) => !['$contains', '$all', '$sequence'].includes(k))
    }
  }
  return false
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
    } catch (e) {
      // Not a valid JSON Schema
      console.error('validateJsonSchema error:', e)
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
