import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn, MatchResult } from '../types.js'
import { validateStringDiff } from '../diff.js'
import { DiffOptions } from '../types.js'

/**
 * Validates a string using diff analysis.
 */
export async function validateDiff(
  actual: any,
  expected: any,
  ctx: ValidationContext,
  _validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  let expectedValue: any
  let diffOptions: DiffOptions | undefined

  if (
    typeof expected === 'object' &&
    expected !== null &&
    !Array.isArray(expected)
  ) {
    expectedValue = expected.value ?? expected.expected
    diffOptions = expected as DiffOptions
  } else {
    expectedValue = expected
  }

  if (typeof actual !== 'string') {
    return {
      score: 0,
      pass: false,
      message: 'Value mismatch: expected string for $diff',
      expected: expectedValue,
      actual,
    }
  } else {
    const diffResult = await validateStringDiff(
      actual,
      expectedValue,
      ctx,
      diffOptions
    )
    return diffResult
  }
}
