import { ValidationContext, MatchResult } from '../types.js'
import { processValidationResult } from '../utils.js'

/**
 * `$eq` — strict equality check (`===`).
 */
export async function validateEq(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  const pass = actual === expected
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should equal expected' },
    expected,
    actual,
    ctx
  )
}

/**
 * `$ne` — strict inequality check (`!==`).
 */
export async function validateNe(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  const pass = actual !== expected
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should not equal expected' },
    expected,
    actual,
    ctx
  )
}

/**
 * `$gt` — actual must be greater than expected (`>`).
 */
export async function validateGt(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  const pass = actual > expected
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should be greater than expected' },
    expected,
    actual,
    ctx
  )
}

/**
 * `$gte` — actual must be greater than or equal to expected (`>=`).
 */
export async function validateGte(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  const pass = actual >= expected
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should be greater than or equal to expected' },
    expected,
    actual,
    ctx
  )
}

/**
 * `$lt` — actual must be less than expected (`<`).
 */
export async function validateLt(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  const pass = actual < expected
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should be less than expected' },
    expected,
    actual,
    ctx
  )
}

/**
 * `$lte` — actual must be less than or equal to expected (`<=`).
 */
export async function validateLte(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  const pass = actual <= expected
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should be less than or equal to expected' },
    expected,
    actual,
    ctx
  )
}

/**
 * `$in` — actual must be one of the values in the expected array.
 */
export async function validateIn(
  actual: any,
  expected: any[],
  ctx: ValidationContext
): Promise<MatchResult> {
  if (!Array.isArray(expected)) {
    return processValidationResult(
      { score: 0, pass: false, message: '$in expects an array' },
      expected,
      actual,
      ctx
    )
  }
  const pass = expected.includes(actual)
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should be in expected array' },
    expected,
    actual,
    ctx
  )
}

/**
 * `$nin` — actual must NOT be one of the values in the expected array.
 */
export async function validateNin(
  actual: any,
  expected: any[],
  ctx: ValidationContext
): Promise<MatchResult> {
  if (!Array.isArray(expected)) {
    return processValidationResult(
      { score: 0, pass: false, message: '$nin expects an array' },
      expected,
      actual,
      ctx
    )
  }
  const pass = !expected.includes(actual)
  return processValidationResult(
    { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Value should not be in expected array' },
    expected,
    actual,
    ctx
  )
}
