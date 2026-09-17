/**
 * A standard 4-arg operator
 */
export async function testOp(actual, expected, ctx, validateMatch) {
  if (actual === expected) return []
  ctx.addFailure({ message: 'testOp failed', actual, expected })
  return ctx.failures
}

/**
 * A 3-arg custom operator using the simplified signature
 */
export function checkName(actual, expected, fixture) {
  const { firstName, lastName } = expected
  if (actual.includes(firstName) && (!lastName || actual.includes(lastName))) {
    return true
  }
  return `Name check failed: expected ${firstName} ${lastName || ''}`
}

/**
 * Default export for testing
 */
export default function defaultOp(actual, expected) {
  return actual === expected
}

/**
 * Test operator for $value convention
 */
export function checkValue(actual, expected, fixture) {
  const { minLength } = fixture.$options || {}
  if (actual === expected && (!minLength || actual.length >= minLength)) {
    return true
  }
  return `Check failed for ${expected} with options ${JSON.stringify(fixture.$options)}`
}

export const notAFunction = 'I am just a string'
