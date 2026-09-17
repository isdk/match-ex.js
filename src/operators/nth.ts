import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn } from '../types.js'
import { omit } from 'lodash-es'

/**
 * Validates that an array element at a specific index matches expectations.
 *
 * @example
 * "$nth": {
 *   "$index": 0, // 0 for the first element, -1 for the last element
 *   "status": "published"
 * }
 */
export async function validateNth(
  actual: any,
  expected: any,
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  if (!Array.isArray(actual)) {
    return {
      score: 0,
      pass: false,
      message: '$nth mismatch: actual value is not an array',
      expected,
      actual,
    }
  }

  if (actual.length === 0) {
    return {
      score: 0,
      pass: false,
      message: '$nth mismatch: actual array is empty',
      expected,
      actual,
    }
  }

  let index = expected.$index ?? 0
  
  if (typeof index !== 'number') {
    return {
      score: 0,
      pass: false,
      message: '$nth mismatch: $index must be a number',
      expected: index,
      actual: typeof index,
    }
  }

  // Handle negative index
  const actIndex = index < 0 ? actual.length + index : index

  if (actIndex < 0 || actIndex >= actual.length) {
    return {
      score: 0,
      pass: false,
      message: `$nth mismatch: index ${index} is out of bounds for array of length ${actual.length}`,
      expected,
      actual,
    }
  }

  const item = actual[actIndex]

  // Extract instructions to keep only assertions
  const restExpected = omit(expected, ['$index'])

  // Create a new context indicating the specific array element
  // Since we are moving from the parent 'array' node to its i-th child node
  const nextCtx = ctx.createSubContext(`[${actIndex}]`)
  
  // Inherit score budget
  nextCtx.allocatedScore = ctx.allocatedScore

  const result = await validateMatch(item, restExpected, nextCtx)
  return result as ValidationResult
}

validateNth.virtual = true // Keeps "$nth" transparent in the object path

/**
 * Syntactic sugar for getting the first element.
 * Equivalent to $nth with $index: 0
 */
export async function validateFirst(
  actual: any,
  expected: any,
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  const newExpected = {
    ...expected,
    $index: 0
  }
  return validateNth(actual, newExpected, ctx, validateMatch)
}
validateFirst.virtual = true

/**
 * Syntactic sugar for getting the last element.
 * Equivalent to $nth with $index: -1
 */
export async function validateLast(
  actual: any,
  expected: any,
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  const newExpected = {
    ...expected,
    $index: -1
  }
  return validateNth(actual, newExpected, ctx, validateMatch)
}
validateLast.virtual = true
