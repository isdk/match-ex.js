import {
  diffChars,
  diffLines,
  diffWords,
  diffWordsWithSpace,
  diffSentences,
  Change,
  DiffSentencesOptionsNonabortable,
} from 'diff'
import { get as getByPath, has as hasByPath, cloneDeep } from 'lodash-es'
import { isRegExp, toRegExp, getKeysPath } from './utils.js'
import {
  DiffItem,
  MatchFailure,
  DiffOptions,
  DiffType,
} from './types.js'
import { ValidationContext, MatchResult } from './types.js'
import { isStrict, calculateNormalizedWeights, getScoreConfig } from './utils.js'
import { formatTemplate } from './template.js'

/**
 * Checks if a diff list contains any additions or removals.
 */
export function hasDiffChanges(diff: DiffItem[]): boolean {
  return diff.some((d) => d.added || d.removed)
}

function isJsonLike(str: string): boolean {
  const s = str.trim()
  return (
    (s.startsWith('{') && s.endsWith('}')) ||
    (s.startsWith('[') && s.endsWith(']'))
  )
}

function parseJsonSafe(str: string): any {
  try {
    return JSON.parse(str)
  } catch (e) {
    return null
  }
}

/**
 * Performs a structured, path-based diff on two JSON-serializable objects.
 */
function diffJsonStructured(
  expected: any,
  actual: any,
  _options: DiffOptions = {}
): DiffItem[] {
  const expectedPaths = getKeysPath(expected)
  const actualPaths = getKeysPath(actual)

  const allPaths = Array.from(
    new Set([...expectedPaths, ...actualPaths])
  ).sort()
  const diffs: DiffItem[] = []

  for (const path of allPaths) {
    const eVal = getByPath(expected, path)
    const aVal = getByPath(actual, path)

    const inExpected = expectedPaths.includes(path)
    const inActual = actualPaths.includes(path)

    if (!inExpected) {
      // Added in actual
      diffs.push({
        count: 1,
        added: true,
        removed: false,
        path,
        val: aVal,
        value: `${path}: ${JSON.stringify(aVal)}`,
      })
    } else if (!inActual) {
      // Removed from expected
      diffs.push({
        count: 1,
        added: false,
        removed: true,
        path,
        val: eVal,
        value: `${path}: ${JSON.stringify(eVal)}`,
      })
    } else if (JSON.stringify(eVal) !== JSON.stringify(aVal)) {
      // Changed
      diffs.push({
        count: 1,
        added: false,
        removed: true,
        path,
        val: eVal,
        value: `${path}: ${JSON.stringify(eVal)}`,
      })
      diffs.push({
        count: 1,
        added: true,
        removed: false,
        path,
        val: aVal,
        value: `${path}: ${JSON.stringify(aVal)}`,
      })
    }
  }

  return diffs
}

/**
 * Heuristically detects the best diff strategy based on content.
 */
function detectDiffType(expected: string, actual: string): DiffType {
  if (isJsonLike(expected) && isJsonLike(actual)) {
    if (parseJsonSafe(expected) !== null && parseJsonSafe(actual) !== null) {
      return 'json'
    }
  }

  if (expected.includes('\n') || actual.includes('\n')) {
    return 'lines'
  }

  if (
    (expected.length >= 20 && expected.includes(' ')) ||
    (actual.length >= 20 && actual.includes(' '))
  ) {
    return 'words'
  }

  return 'chars'
}

/**
 * Gets the diff items using the specified or detected strategy.
 */
export function getDiff(
  expected: any,
  actual: any,
  options: DiffOptions = {}
): DiffItem[] {
  const originalType = options.type || 'chars'
  let type: DiffType = originalType

  if (type === 'auto') {
    type = detectDiffType(String(expected), String(actual))
  }

  let result: DiffItem[]
  switch (type) {
    case 'json': {
      const e =
        typeof expected === 'string'
          ? parseJsonSafe(expected) || expected
          : expected
      const a =
        typeof actual === 'string' ? parseJsonSafe(actual) || actual : actual
      result = diffJsonStructured(e, a, options)
      break
    }
    case 'lines':
      result = diffLines(expected, actual, options)
      break
    case 'words':
      result = diffWords(expected, actual, options)
      break
    case 'wordsWithSpace':
      result = diffWordsWithSpace(expected, actual, options)
      break
    case 'sentences':
      result = diffSentences(
        expected,
        actual,
        options as DiffSentencesOptionsNonabortable
      )
      break
    default:
      result = diffChars(expected, actual, options)
      break
  }

  if (
    originalType === 'auto' &&
    type !== 'chars' &&
    type !== 'json' &&
    expected !== actual &&
    !result.some((d) => d.added || d.removed)
  ) {
    return diffChars(String(expected), String(actual), options)
  }

  return result
}

/**
 * Formats a list of AIDiffItems by applying prompt templates.
 */
export async function formatDiffList(
  diff: DiffItem[],
  ctx: ValidationContext
) {
  const result = cloneDeep(diff)
  for (const d of result) {
    const value = d.value
    if (typeof value === 'string' || isRegExp(value)) {
      d.value = await formatTemplate(value, {
        data: ctx.data,
        input: ctx.input,
        templateFormat: ctx.data?.templateFormat,
      })
    }
  }
  return result
}

/**
 * Checks if a specific actual diff change matches any expected diff definitions.
 */
export function findDiffItem(
  diff: DiffItem[],
  item: DiffItem,
  _ctx: ValidationContext
) {
  let result: Change | undefined
  const itemAdded = !!item.added
  const itemRemoved = !!item.removed

  for (const d of diff) {
    const unchanged = !(itemAdded || itemRemoved)
    if (unchanged && (d.added === true || d.removed === true)) continue
    if (d.added !== undefined && !!d.added !== itemAdded) continue
    if (d.removed !== undefined && !!d.removed !== itemRemoved) continue

    result = item
    const value = d.value
    const path = d.path
    const val = d.val

    if (path !== undefined && item.path !== undefined) {
      let pathMatched = false
      if (isRegExp(path)) pathMatched = toRegExp(path).test(item.path)
      else pathMatched = path === item.path

      if (!pathMatched) result = undefined
      else if (value !== null && value !== undefined) {
        if (isRegExp(value)) {
          if (!toRegExp(value).test(item.value)) result = undefined
        } else if (value !== item.value && value !== item.value.trim())
          result = undefined
      } else if (val !== undefined) {
        if (JSON.stringify(val) !== JSON.stringify(item.val)) result = undefined
      }
    } else if (value != null) {
      const itemValue = item.value
      const itemValueNoNL = itemValue.replace(/\r?\n$/, '')

      if (isRegExp(value)) {
        const regEx = toRegExp(value)
        if (
          !regEx.test(itemValue) &&
          !regEx.test(itemValueNoNL) &&
          !regEx.test(itemValue.trim())
        )
          result = undefined
      } else if (
        itemValue !== value &&
        itemValueNoNL !== value &&
        itemValue.trim() !== (typeof value === 'string' ? value.trim() : value)
      ) {
        result = undefined
      }
    }

    if (result) break
  }
  return result
}

/**
 * Validates a string mismatch using structured diff analysis.
 *
 * The score reflects the confidence based on matched diff items. Even if the validation
 * fails (pass: false) due to strict mode or unverified changes, the score will still
 * represent the sum of weights of successfully matched items.
 *
 * If no explicit diff items are provided, a mismatch results in score 0.
 */
export async function validateStringDiff(
  actual: string,
  expected: string,
  ctx: ValidationContext,
  options?: DiffOptions
): Promise<MatchResult> {
  const { input } = ctx
  const failures: MatchFailure[] = []
  let score = 1.0
  let pass = true

  let diffOptions: DiffOptions = options || {}
  let expectedDiff = diffOptions.items || input?.diff
  let diffPermissive =
    diffOptions.permissive ??
    ctx.diffPermissive ??
    input?.diffPermissive ??
    input?.input?.diffPermissive

  if (expectedDiff === true) {
    diffOptions.type = diffOptions.type || 'auto'
    expectedDiff = undefined
  } else if (expectedDiff && !Array.isArray(expectedDiff)) {
    if (typeof expectedDiff === 'object') {
      if ('items' in (expectedDiff as any) || 'type' in (expectedDiff as any)) {
        const nestedOptions = expectedDiff as DiffOptions
        diffOptions = { ...diffOptions, ...nestedOptions }
        diffPermissive = diffPermissive ?? diffOptions.permissive
        expectedDiff = diffOptions.items
      }
    } else if (
      typeof expectedDiff === 'string' &&
      expectedDiff !== 'function'
    ) {
      diffOptions.type = diffOptions.type || (expectedDiff as DiffType)
      expectedDiff = undefined
    }
  }

  if (!expectedDiff && !diffOptions.type) diffOptions.type = 'auto'

  const diff: DiffItem[] = getDiff(expected, actual, diffOptions)
  const hasChanges = hasDiffChanges(diff)

  if (Array.isArray(expectedDiff)) {
    // 1. Complex Scoring: Based on explicit diff items
    const formattedExpectedDiff = await formatDiffList(expectedDiff, ctx)
    const matchedExpectedIndices = new Set<number>()

    const successfulItems = diff.filter((d) => {
      let matchedIdx = -1
      const matched = (formattedExpectedDiff as DiffItem[]).some(
        (ed, idx) => {
          const m = findDiffItem([ed], d, ctx)
          if (m) {
            matchedIdx = idx
            return true
          }
          return false
        }
      )
      if (matched) matchedExpectedIndices.add(matchedIdx)
      return matched
    })

    const strictDiff = isStrict('diff', ctx)
    const allExpectedMatched =
      matchedExpectedIndices.size === expectedDiff.length
    const missingRequiredItems = (expectedDiff as DiffItem[]).filter(
      (ed, idx) => ed.required === true && !matchedExpectedIndices.has(idx)
    )
    const hasUnverified = diff.some(
      (d) => (d.added || d.removed) && !successfulItems.includes(d)
    )

    if (ctx.scoring) {
      const includeStrictness = !diffPermissive || strictDiff
      const explicitWeights = (expectedDiff as DiffItem[]).map((item) => {
        return getScoreConfig(item).weight
      })

      const weightPool = includeStrictness
        ? [...explicitWeights, null]
        : explicitWeights
      const weights = calculateNormalizedWeights(weightPool, {
        totalUnassignedWeight: ctx.unassignedWeight,
        maxScore: ctx.maxScore, // Add maxScore for correct scaling
      })

      let earnedFraction = 0
      for (let i = 0; i < expectedDiff.length; i++) {
        if (matchedExpectedIndices.has(i)) earnedFraction += weights[i]
      }
      if (includeStrictness && !hasUnverified) {
        earnedFraction += weights[weights.length - 1]
      }
      score = earnedFraction
    } else {
      score = pass ? 1.0 : 0.0
    }

    let failed = false
    const reasons: string[] = []
    const getDiffDesc = (item: DiffItem) =>
      item.value ||
      (item.path
        ? item.val !== undefined
          ? `${item.path}: ${JSON.stringify(item.val)}`
          : item.path
        : 'unknown')

    if (strictDiff) {
      if (hasUnverified) {
        failed = true
        reasons.push('unverified changes')
      }
      if (!allExpectedMatched) {
        failed = true
        reasons.push('not all expected diff items were found (strict mode)')
      }
    } else {
      if (!diffPermissive && hasUnverified) {
        failed = true
        reasons.push('unverified changes')
      }
      if (missingRequiredItems.length > 0) {
        failed = true
        reasons.push(
          `missing required diff items: ${missingRequiredItems.map((item) => `${item.added ? '+' : '-'}"${getDiffDesc(item)}"`).join(', ')}`
        )
      }
    }

    if (failed) {
      pass = false
      failures.push({
        key: ctx.key,
        message: `String mismatch with diff: ${reasons.join('; ')}`,
        expected,
        actual,
        diff,
      })
    }
  } else if (typeof expectedDiff === 'function') {
    // 2. Custom Validator Function
    const successfulItems = await expectedDiff(actual, input, diff)
    if (successfulItems.length < diff.length) {
      successfulItems.forEach((d: any) => {
        d.verified = true
      })
      if (
        diff.filter((d) => !d.verified && (d.added || d.removed)).length === 0
      ) {
        if (ctx.scoring) score = 1
      } else {
        pass = false
        score = 0
        failures.push({
          key: ctx.key,
          message: 'String mismatch with diff (custom verification failed)',
          expected,
          actual,
          diff,
        })
      }
    } else {
      if (ctx.scoring) score = 1
    }
  } else if (hasChanges) {
    // 3. Simple String Mismatch: Binary Scoring (0 or 1)
    pass = false
    score = 0
    failures.push({
      key: ctx.key,
      message: 'String mismatch with diff',
      expected,
      actual,
      diff,
    })
  } else if (ctx.scoring) {
    // 4. Perfect Match
    score = 1
  }

  return { score, pass, failures }
}
