export function checkCode(actual, expected, fixture) {
  if (expected.strict && actual.includes('eval')) {
    return 'eval is not allowed'
  }
  if (fixture.options?.lang === 'ts' && !actual.includes(':')) {
    return 'TypeScript requires type annotations'
  }
  return true
}

export default function(actual, expected) {
  if (actual !== expected) {
    return `Expected ${expected}, but got ${actual}`
  }
  return true
}
