import { isRegExp as _isRegExp, isRegExpStr } from 'util-ex'
import {
  StrictOption,
  ValidationResult,
  MatchFailure,
} from './types.js'
import { ValidationContext, MatchResult, MatchResultDetail, ArrayLoopOptions } from './types.js'

export { toRegExp } from 'util-ex'

/**
 * Checks whether the value is a `RegExp` instance or a RegExp-like string
 * (e.g. `'/abc/g'`).
 *
 * This is the exact semantics of `isRegExp` from `@isdk/ai-tool`, inlined here
 * so the matching engine does not need to depend on an AI package:
 * `isRegExpStr(value) || isRegExp(value)`.
 */
export function isRegExp(value: any): boolean {
  return isRegExpStr(value) || _isRegExp(value)
}

function isPlainObject(value: any): value is object {
  return !!value && value.constructor === Object
}

/**
 * Retrieves an array of all key paths as strings for a nested object or array.
 *
 * @example
 * ```ts
 * getKeysPath({ a: { b: { c: 1 } }, d: [0, { e: 2 }] }) // ['a.b.c', 'd[0]', 'd[1].e']
 * ```
 */
export function getKeysPath<TValue extends object>(value: TValue): string[] {
  if (!value) return []
  return _getKeys(value, [], { dot: '' })
}

function _getKeys(
  obj: any,
  paths: string[],
  { dot = '.', visited = new Set<any>() }: { dot?: string; visited?: Set<any> } = {}
): string[] {
  if (visited.has(obj)) {
    return [paths.join('')]
  }

  if (Array.isArray(obj)) {
    visited.add(obj)
    return obj.flatMap((item, i) => _getKeys(item, [...paths, `[${i}]`], { dot: '.', visited }))
  }

  if (isPlainObject(obj)) {
    visited.add(obj)
    return Object.entries(obj).flatMap(([k, v]) =>
      _getKeys(v, [...paths, dot + k], { dot: '.', visited })
    )
  }

  return [paths.join('')]
}

/**
 * Reserved metadata control keys.
 */
export const META_CONTAINER = '$meta'
/**
 * Shorthand keys for node metadata (`$score`, `$critical`, `$title`,
 * `$description`, `$dimension`, `$strategy`, `$threshold`).
 *
 * Only recognized as metadata when the item has no explicit `$meta` container —
 * see {@link isMetadataKey}.
 */
export const META_SHORTHANDS = ['$score', '$critical', '$title', '$description', '$dimension', '$strategy', '$threshold']

/**
 * Checks if a key is a reserved metadata key for the given item.
 * Exclusivity: If $meta exists, shorthands are NOT treated as metadata.
 */
export function isMetadataKey(key: string, item: any): boolean {
  if (key === META_CONTAINER) return true
  const meta = item && typeof item === 'object' ? item[META_CONTAINER] : undefined
  const hasMetaContainer = meta && typeof meta === 'object'
  if (!hasMetaContainer && META_SHORTHANDS.includes(key)) return true
  return false
}

/**
 * Internal helper to extract weight and critical flag from a node.
 * Priorities & Exclusivity:
 * 1. If $meta exists, ALL metadata is extracted from it. Shorthands are ignored.
 * 2. If $meta is missing, shorthand keys ($score, $title, etc.) are used.
 */
export function getScoreConfig(item: any): {
  weight: number | null
  critical: boolean
  strategy?: string
  threshold?: number
  title?: string
  dimension?: string
} {
  let weight: number | null = null
  let critical = false
  let strategy: string | undefined
  let threshold: number | undefined
  let title: string | undefined
  let dimension: string | undefined

  if (item && typeof item === 'object') {
    const meta = item[META_CONTAINER]
    if (meta && typeof meta === 'object') {
      // Explicit Mode: Use $meta container ONLY
      title = meta.title
      dimension = meta.dimension
      critical = !!meta.critical
      strategy = meta.strategy
      threshold = meta.threshold
      if (meta.score !== undefined) {
        const s = meta.score
        if (typeof s === 'number') {
          weight = s
        } else if (typeof s === 'object' && s !== null) {
          weight = s.value ?? 1
          critical = s.critical ?? critical
          strategy = s.strategy ?? strategy
          threshold = s.threshold ?? threshold
          if (s.title) title = s.title
          if (s.dimension) dimension = s.dimension
        }
      }
    } else {
      // Shorthand Mode: Use $ prefixed keys
      title = item.$title
      dimension = item.$dimension
      critical = !!item.$critical
      strategy = item.$strategy
      threshold = item.$threshold

      if (item.$score !== undefined) {
        const s = item.$score
        if (typeof s === 'number') {
          weight = s
        } else if (typeof s === 'object' && s !== null) {
          weight = s.value ?? 1
          critical = s.critical ?? critical
          strategy = s.strategy ?? strategy
          threshold = s.threshold ?? threshold
          if (s.title) title = s.title
          if (s.dimension) dimension = s.dimension
        }
      }
    }
  }

  return { weight, critical, strategy, threshold, title, dimension }
}

/**
 * Checks if strict mode is enabled for a specific type.
 */
export function isStrict(
  type: 'object' | 'diff' | 'array',
  strict?: StrictOption | ValidationContext
): boolean {
  if (strict instanceof ValidationContext) {
    strict = strict.strict
  }
  if (typeof strict === 'boolean') return strict
  if (typeof strict === 'string') return strict === type
  if (Array.isArray(strict)) return strict.includes(type)
  return false
}

/**
 * Processes the result of a validation function/operator and normalizes it to a MatchResult.
 * Performs "auto-backfill" of missing keys and context information for failures.
 * This is a pure function that does NOT modify the context.
 *
 * @param result - The raw result from an operator or function.
 * @param expected - The expected value used for matching.
 * @param actual - The actual value received.
 * @param ctx - The current validation context.
 * @param options - Additional normalization options.
 * @returns MatchResult containing score, pass status and normalized failures.
 */
export function processValidationResult(
  result: ValidationResult,
  expected: any,
  actual: any,
  ctx: ValidationContext,
  options: { key?: string } = {}
): MatchResult {
  let score = 0
  let pass = false
  let failures: MatchFailure[] = []
  let message: string | undefined
  let dimension: string | undefined
  let details: MatchResultDetail[] | undefined
  let title: string | undefined
  let critical: boolean | undefined

  if (result === true) {
    score = 1.0
    pass = true
  } else if (result === false) {
    score = 0.0
    pass = false
    message = 'Validation failed'
  } else if (typeof result === 'string') {
    score = 0.0
    pass = false
    message = result
  } else if (typeof result === 'number') {
    score = Math.max(0, Math.min(1, result))
    if (ctx.threshold !== undefined) {
      pass = score >= ctx.threshold
      if (!pass) {
        message = `Score ${score.toFixed(2)} is below threshold ${ctx.threshold}`
      }
    } else {
      pass = true
    }
  } else if (typeof result === 'object' && result !== null) {
    // 处理 MatchResult 或自定义对象结果
    const resObj = result as any
    const hasScore = typeof resObj.score === 'number'
    const hasPass = resObj.pass !== undefined

    if (!hasScore && !hasPass && !Array.isArray(resObj.failures)) {
       score = 0.0
       pass = false
       message = 'Invalid validation result: unrecognized object format'
    } else {
      score = typeof resObj.score === 'number' ? Math.max(0, Math.min(1, resObj.score)) : 0
      if (resObj.pass !== undefined) {
        pass = !!resObj.pass
      } else if (ctx.threshold !== undefined) {
        pass = score >= ctx.threshold
      } else {
        pass = true
      }

      message = resObj.message

      /**
       * 【业务逻辑保留理由】
       * 即使在 pass: true 的情况下，也必须提取这些元数据。
       * title, dimension 和 details 用于生成多维度的得分报告和详情树。
       * 丢弃这些数据会导致顶层日志无法回溯评分细节。
       */
      dimension = resObj.dimension
      title = resObj.title
      critical = resObj.critical
      if (Array.isArray(resObj.details)) {
        details = resObj.details
      }

      if (!pass && !message && ctx.threshold !== undefined) {
         message = `Score ${score.toFixed(2)} is below threshold ${ctx.threshold}`
      }

      if (Array.isArray(resObj.failures)) {
        failures = resObj.failures
      }
    }
  } else {
    score = 0.0
    pass = false
    message = 'Invalid validation result: unknown type'
  }

  if (!pass && failures.length === 0) {
    failures.push({
      key: options.key || ctx.key,
      message: message || 'Validation failed',
      expected,
      actual,
    })
  }

  // 为所有失败项自动补全上下文信息
  const finalFailures = failures.map((f) => {
    const newFailure: MatchFailure = {
      ...f,
      key: f.key || options.key || ctx.key,
    }
    if (newFailure.expected === undefined) newFailure.expected = expected
    if (newFailure.actual === undefined) newFailure.actual = actual

    // 如果当前分支是红线分支（Critical），则标记所有失败为 Critical
    if (ctx.isCriticalBranch || critical) newFailure.critical = true
    return newFailure
  })

  const res: MatchResult = { score, pass, failures: finalFailures, dimension, title, critical, details }

  /**
   * 【业务逻辑保留理由】
   * 如果有维度信息但没有详情树，创建一个单节点详情。
   * 这是为了确保所有的“叶子”评分节点都能在最终报告的 details 中占有一席之地。
   */
  if (dimension && !details) {
    res.details = [{ key: options.key || ctx.key, score, weight: 1.0, pass, dimension }]
  }
  return res
}

/**
 * Patches a MatchResult with metadata (title, dimension, critical) and ensures details are consistent.
 * This is the main orchestration function called at each recursive exit.
 */
export function patchMatchResult(
  res: MatchResult,
  metadata: {
    title?: string
    dimension?: string
    critical?: boolean
  },
  key?: string
): MatchResult {
  applyMetadata(res, metadata)
  return ensureDetailLayer(res, key)
}

function applyMetadata(res: MatchResult, metadata: any) {
  const { title, dimension, critical } = metadata
  if (title) res.title = res.title || title
  if (dimension) res.dimension = res.dimension || dimension
  if (critical !== undefined) res.critical = res.critical || critical

  if (title) {
    res.failures.forEach((f) => {
      if (f.message === 'Validation failed') f.message = title
    })
  }

  if (res.details) {
    res.details.forEach((d) => {
      if (title) d.title = d.title || title
      if (dimension) d.dimension = d.dimension || dimension
      if (critical) d.critical = true
    })
  }
}

function ensureDetailLayer(res: MatchResult, key: string | undefined): MatchResult {
  /**
   * 【逻辑容器与身份代表契约】
   * 1. 如果 key 为空（虚拟容器），则该层级不产生物理节点，直接透传子节点详情。
   * 2. 如果 key 有值（物理层级），且第一个详情的 key 已经是我，说明身份已被代表，直接合并。
   * 3. 否则，必须创建一个包装节点作为本层级的“身份代表”，以维持树的拓扑深度。
   */
  if (!key) return res

  const hasDetails = res.details && res.details.length > 0
  const firstDetailKey = hasDetails ? res.details![0].key : undefined

  if (!hasDetails) {
    res.details = [{
      key,
      score: res.score,
      weight: 1.0,
      pass: res.pass,
      title: res.title,
      dimension: res.dimension,
      critical: res.critical,
    }]
  } else if (firstDetailKey !== key) {
    const newDetail: MatchResultDetail = {
      key,
      score: res.score,
      weight: 1.0,
      pass: res.pass,
      title: res.title,
      dimension: res.dimension,
      critical: res.critical,
      details: res.details,
    }
    res.details = [newDetail]
  }

  return res
}

/**
 * Calculates normalized weights for a set of items, balancing explicit scores and unassigned items.
 *
 * 【核心评分逻辑说明】
 * 1. 奖励项 (score > 0): 参与 Balanced 模式归一化，总和为 1.0。
 * 2. 扣分项 (score < 0): 不参与 1.0 预算的竞争，仅根据 scale 转换为绝对权重。
 * 3. 混合模式: 允许用户同时使用百分比 (0~1) 和绝对分值 (>=1)，系统根据 maxScore 自动适配。
 */
export function calculateNormalizedWeights(
  explicitWeights: (number | null)[],
  options: {
    /** The total weight budget reserved for all unassigned (null) items. Defaults to 0.1. */
    totalUnassignedWeight?: number
    /** Whether to normalize the total sum of positive items to 1.0. Defaults to true. */
    normalize?: boolean
    /** The maximum possible value for explicit weights, used for scaling. Defaults to 100. */
    maxScore?: number
    /** Whether to automatically treat values between 0 and 1 as confidence scores. Defaults to true. */
    autoConfidence?: boolean | 'force'
  } = {}
): number[] {
  const {
    normalize = true,
    maxScore = 100,
    autoConfidence = true,
  } = options
  let totalUnassignedWeight = options.totalUnassignedWeight ?? 0.1

  const unassignedCount = explicitWeights.filter((w) => w === null).length

  // 1. 统一量纲：根据 maxScore 将所有显式得分映射到 0-1 的置信度空间
  const maxExplicit = Math.max(
    ...explicitWeights.filter((w): w is number => w !== null && w > 0),
    0
  )
  const scale = Math.max(maxScore, maxExplicit)

  // 调整未分配权重的量纲
  if (!((autoConfidence && totalUnassignedWeight >= 0 && totalUnassignedWeight < 1) || (autoConfidence === 'force'))) {
    totalUnassignedWeight = totalUnassignedWeight / scale
  }

  const explicitConfidences = explicitWeights.map((w) => {
    if (w === null) return null
    // 如果权重已经在 0-1 之间且开启了 autoConfidence，视为已归一化
    if ((autoConfidence && Math.abs(w) >= 0 && Math.abs(w) < 1) || (autoConfidence === 'force')) return w
    return w / scale
  })

  // 仅计算正数项的总和用于归一化预算分配
  const positiveSum = explicitConfidences.reduce<number>((a, b) => a + (b !== null && b > 0 ? b : 0), 0)

  // Independent 模式：每个项独立计算，互不干扰
  if (!normalize) {
    return explicitConfidences.map((w) => {
      if (w !== null) return w
      return unassignedCount > 0 ? totalUnassignedWeight / unassignedCount : 0
    })
  }

  // Balanced 模式：确保所有正权重项之和为 1.0
  let finalUnassignedTotal = 0
  let explicitFactor = 1

  if (unassignedCount > 0) {
    if (positiveSum + totalUnassignedWeight <= 1.0) {
      // 空间充足：未标注项平分剩余空间
      finalUnassignedTotal = 1.0 - positiveSum
    } else {
      // 空间不足：确保未标注项的保底预算，压缩显式项
      finalUnassignedTotal = totalUnassignedWeight
      explicitFactor =
        positiveSum > 0 ? (1.0 - totalUnassignedWeight) / positiveSum : 0
    }
  } else {
    // 全显式：按比例缩放到总和为 1.0
    explicitFactor = positiveSum > 0 ? 1.0 / positiveSum : 0
  }

  return explicitConfidences.map((w) => {
    if (w === null) return finalUnassignedTotal / unassignedCount
    if (w >= 0) return w * explicitFactor
    /**
     * 【惩罚项保留逻辑】
     * 惩罚项（负数）不参与正数项的比例瓜分。
     * 直接返回归一化后的绝对负权重，确保 score: -20 在 maxScore: 100 时权重正好是 -0.2。
     */
    return w
  })
}

/**
 * Builds {@link ArrayLoopOptions} for the item at index `i` of `arr`.
 */
export function genArrayLoopOptions(arr: any[], i: number) {
  const result: ArrayLoopOptions = {
    first: i === 0,
    index: i,
    last: i === arr.length - 1,
    length: arr.length,
  }
  return result
}
