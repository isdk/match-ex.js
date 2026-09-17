import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn } from '../types.js'
import { validateJsonSchema } from '../schema.js'

/**
 * Explicitly validates a value against a JSON Schema.
 */
export async function validateSchemaOperator(
  actual: any,
  expected: any,
  ctx: ValidationContext,
  _validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  return await validateJsonSchema(actual, expected, ctx)
}
