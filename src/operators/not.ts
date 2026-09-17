import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn, MatchResult } from '../types.js'

/**
 * Validates that a value does NOT match the specified expectation.
 */
export async function validateNot(
  actual: any,
  expected: any,
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  /**
   * 【路径自动化】
   * 由于 $not 只有一个子项且被标记为 transparent，
   * createChildContext(0, 1) 将自动返回继承父路径的上下文。
   */
  const subCtx = ctx.createChildContext(0, 1)
  subCtx.allocatedScore = ctx.allocatedScore
  const result = await validateMatch(actual, expected, subCtx)

  if (result.pass) {
    return {
      score: 0,
      pass: false,
      message: '$not mismatch: value matches expectation but should not',
      expected,
      actual,
    }
  } else {
    return {
      score: 1.0,
      pass: true,
      failures: [],
    }
  }
}
