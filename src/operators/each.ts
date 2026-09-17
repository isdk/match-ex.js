import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn, MatchResult } from '../types.js'
import { genArrayLoopOptions, processValidationResult } from '../utils.js'

/**
 * Validates that EVERY item in an array matches the specified expectation.
 */
export async function validateEach(
  actual: any[],
  expected: any,
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  if (!Array.isArray(actual)) {
    return {
      score: 0,
      pass: false,
      message: `$each operator requires an array, but got ${typeof actual}`,
      actual,
    }
  }

  if (actual.length === 0) {
    return {
      score: 1,
      pass: true,
      failures: [],
    }
  }

  const explicitWeights = actual.map(() => 1)
  const weights = ctx.distribute(explicitWeights)
  const results: MatchResult[] = []

  for (let i = 0; i < actual.length; i++) {
    const subCtx = ctx.createChildContext(i, actual.length, {loop: genArrayLoopOptions(actual, i)})
    subCtx.allocatedScore = weights[i] * ctx.allocatedScore

    const result = await validateMatch(actual[i], expected, subCtx)
    const matchResult = processValidationResult(result, expected, actual[i], subCtx)

    results.push(matchResult)
  }

  return ctx.aggregate(results, weights)
}

validateEach.strategy = 'weighted'
validateEach.expects = ['array']
