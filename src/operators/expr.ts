import { newFunction } from 'util-ex'
import { ValidationContext, MatchResult } from '../types.js'
import { processValidationResult } from '../utils.js'

/**
 * `$expr` — evaluates a JS expression string against the actual value.
 *
 * The expression is compiled via `newFunction` with the scope
 * `{ actual, expected, data, fixture, ctx, loop }` available as free
 * variables. Its return value is interpreted as:
 * - `boolean` → pass/fail, score 1/0
 * - `number` → used directly as the score (truthiness decides pass)
 * - `{ pass?, score? }` → merged into the result via `processValidationResult`
 * - anything else → coerced to boolean
 */
export async function validateExpr(
  actual: any,
  expected: string,
  ctx: ValidationContext
): Promise<MatchResult> {
  if (typeof expected !== 'string') {
    return processValidationResult(
      { score: 0, pass: false, message: '$expr expects a string expression' },
      expected,
      actual,
      ctx
    )
  }

  try {
    const fnScopeData: any = {
      actual,
      expected,
      data: ctx.data,
      fixture: ctx.input,
      ctx,
    }
    if (ctx.loop) {fnScopeData.loop = ctx.loop}
    const fn = newFunction(expected, fnScopeData)

    const res = await fn()

    if (typeof res === 'boolean') {
      return processValidationResult(
        { score: res ? 1 : 0, pass: res, message: res ? undefined : 'Expression evaluated to false' },
        expected,
        actual,
        ctx
      )
    } else if (typeof res === 'number') {
      return processValidationResult(res, expected, actual, ctx)
    } else if (typeof res === 'object' && res !== null && ('pass' in res || 'score' in res)) {
      return processValidationResult(res, expected, actual, ctx)
    } else {
      const pass = !!res
      return processValidationResult(
        { score: pass ? 1 : 0, pass, message: pass ? undefined : 'Expression evaluated to falsy' },
        expected,
        actual,
        ctx
      )
    }
  } catch (err: any) {
    return processValidationResult(
      { score: 0, pass: false, message: `$expr evaluation error: ${err.message}` },
      expected,
      actual,
      ctx
    )
  }
}
