import { ValidationResult } from '../types.js'
import { ValidationContext } from '../types.js'

/**
 * Validates whether a property exists or is defined.
 *
 * Supports three modes via the `expected` parameter:
 *
 * 1. **Boolean shorthand** (普通模式):
 *    - `$exists: true`  → 要求 actual !== undefined
 *    - `$exists: false` → 要求 actual === undefined
 *
 * 2. **Object form with `nullAsAbsent`** (非空模式):
 *    - `$exists: { $value: true, nullAsAbsent: false }`
 *      → 要求 actual !== undefined && actual !== null
 *    - `$exists: { $value: false, nullAsAbsent: false }`
 *      → 要求 actual === undefined 或 actual === null
 *    - 默认 `nullAsAbsent: false`，与布尔简写行为一致（null 视为 "不存在"）
 *
 * 3. **Object form with `strict`** (严格模式):
 *    - `$exists: { $value: true, strict: true }`
 *      → 要求 key 在父对象中存在（即使值为 undefined/null 也算存在）
 *    - `$exists: { $value: false, strict: true }`
 *      → 要求 key 在父对象中完全缺失
 *    - `strict` 与 `nullAsAbsent` 可组合使用
 */
export async function validateExists(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<ValidationResult> {
  let expectedExists: boolean
  let strict = false
  // 默认 nullAsAbsent: false，与布尔简写行为一致（null 视为 "不存在"）
  let nullAsAbsent = false

  if (
    typeof expected === 'object' &&
    expected !== null &&
    '$value' in expected
  ) {
    expectedExists = !!expected.$value
    strict = !!expected.strict
    if (expected.nullAsAbsent === false) {
      nullAsAbsent = false
    }
  } else {
    expectedExists = !!expected
  }

  const isPresent = ctx.isKeyPresent
  const isAbsent = nullAsAbsent
    ? actual === undefined          // 普通模式：仅 undefined 算"不存在"
    : actual === undefined || actual === null  // 非空模式：undefined 或 null 均算"不存在"

  let failed = false
  let message = ''

  if (strict) {
    if (expectedExists && !isPresent) {
      failed = true
      message = `$exists mismatch: key expected to be present but it is missing`
    } else if (!expectedExists && isPresent) {
      failed = true
      message = `$exists mismatch: key expected to be missing but it exists`
    }
  } else {
    const absentLabel = nullAsAbsent ? 'undefined' : 'undefined or null'
    const presentLabel = nullAsAbsent ? 'defined' : 'non-null'
    const actualLabel = JSON.stringify(actual)

    if (expectedExists && isAbsent) {
      failed = true
      message = `$exists mismatch: value expected to be ${presentLabel} but it is ${actualLabel}`
    } else if (!expectedExists && !isAbsent) {
      failed = true
      message = `$exists mismatch: value expected to be ${absentLabel} but it is ${actualLabel}`
    }
  }

  if (failed) {
    return {
      score: 0,
      pass: false,
      message,
    }
  }

  return true
}
