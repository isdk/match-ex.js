import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn, MatchResult } from '../types.js'
import { getScoreConfig } from '../utils.js'

/**
 * Validates that a value matches at least ONE of the specified expectations.
 * 
 * @param actual - The value to validate.
 * @param expectedList - Array of expectations.
 * @param ctx - Validation context.
 * @param validateMatch - Recursive validation function.
 */
export async function validateOr(
  actual: any,
  expectedList: any[],
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  if (!Array.isArray(expectedList)) {
    return {
      score: 0,
      pass: false,
      message: '$or operator requires an array of expectations',
    }
  }

  const explicitWeights = expectedList.map((item) => getScoreConfig(item).weight)

  const weights = ctx.distribute(explicitWeights)
  const results: MatchResult[] = []

  for (let i = 0; i < expectedList.length; i++) {
    const subCtx = ctx.createChildContext(i, expectedList.length)
    subCtx.allocatedScore = weights[i] * ctx.allocatedScore
    const res = await validateMatch(actual, expectedList[i], subCtx)
    results.push(res)
  }

  return ctx.aggregate(results, weights)
}
validateOr.strategy = 'max'
