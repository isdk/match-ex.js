import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn, MatchResult } from '../types.js'
import { processValidationResult, getScoreConfig } from '../utils.js'
import { validateContains } from './contains.js'

/**
 * Validates that an array contains ALL items specified in the expectation list.
 */
export async function validateAll(
  actual: any[],
  expectedList: any[],
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  if (!Array.isArray(actual)) {
    return {
      score: 0,
      pass: false,
      message: `$all operator requires an array, but got ${typeof actual}`,
      actual,
    }
  }

  const explicitWeights = expectedList.map((item) => getScoreConfig(item).weight)

  const weights = ctx.distribute(explicitWeights)
  const results: MatchResult[] = []

  for (let i = 0; i < expectedList.length; i++) {
    const subCtx = ctx.createChildContext(i, expectedList.length)
    // Pass allocated score to sub-context so it can be used for logging or deep logic
    subCtx.allocatedScore = weights[i] * ctx.allocatedScore

    const result = await validateContains(actual, expectedList[i], subCtx, validateMatch)
    const matchResult = processValidationResult(result, expectedList[i], actual, subCtx)

    results.push(matchResult)
  }

  return ctx.aggregate(results, weights)
  }

validateAll.strategy = 'weighted'
