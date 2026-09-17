import { ScoreConfig } from './types.js'
import { ScoringStrategy, MatchResult, MatchResultDetail } from './types.js'
import { calculateNormalizedWeights } from './utils.js'

function extractWeights(items: (ScoreConfig | null)[]): (number | null)[] {
  return items.map((item) => {
    if (typeof item === 'number') return item
    if (item && typeof item === 'object') return item.value
    return null
  })
}

/**
 * Weighted Sum Strategy (Default for $and and Object/Array)
 * 
 * 核心逻辑：
 * 1. 分数累加：earnedScore = sum(child.score * child.weight)
 * 2. 状态判定：allPassed = true iff (all rewards passed AND no critical penalties triggered)
 */
export const weightedSumStrategy: ScoringStrategy = {
  distribute(items, options) {
    return calculateNormalizedWeights(extractWeights(items), {
      ...options,
      normalize: true,
    })
  },
  aggregate(results: MatchResult[], weights: number[]): MatchResult {
    let score = 0
    let allPassed = true
    const details: MatchResultDetail[] = []
    const allFailures: MatchResult['failures'] = []

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const w = weights[i] || 0
      score += r.score * w
      
      const isCritical = r.critical || r.failures.some(f => f.critical)
      
      if (w >= 0) {
        // 奖励项逻辑：必须通过
        if (!r.pass) allPassed = false
      } else {
        /**
         * 【惩罚项特殊逻辑说明】
         * 如果匹配成功（r.pass 为 true），意味着触发了扣分规则。
         * 如果该项标记为 Critical，则这被视为一个致命错误，整体判定为不通过。
         */
        if (r.pass && isCritical) {
          allPassed = false
          /**
           * 【业务逻辑保留理由】
           * 惩罚项匹配成功时 r.failures 往往为空（因为它符合了正则/算子）。
           * 我们必须手动生成一个 Virtual Failure 才能让 AITestRunner 知道哪个红线被触碰了。
           */
          allFailures.push({
            key: (r.details && r.details.length === 1) ? r.details[0].key : '',
            message: r.title || 'Critical penalty triggered',
            actual: 'Matched',
            expected: 'Should not match',
            critical: true
          })
        }
      }

      allFailures.push(...r.failures)

      /**
       * 【详情收集 (SRP)】
       * 策略层仅负责收集子项的详情列表。具体的路径 (key) 由核心层的 patchMatchResult
       * 已经在每一层递归出口注入。我们只需将其合并即可。
       */
      if (r.details) {
        r.details.forEach(d => {
          d.weight = w
          details.push(d)
        })
      }
    }

    return {
      score,
      pass: allPassed,
      failures: allFailures,
      details,
    }
  },
}

/**
 * Max Strategy (Default for $or, $any, $contains)
 * 
 * 核心逻辑：
 * 1. 取最高分：earnedScore = max(child.score * child.weight)
 * 2. 状态判定：passed = any(child.passed)
 */
export const maxStrategy: ScoringStrategy = {
  distribute(items, options) {
    return calculateNormalizedWeights(extractWeights(items), {
      ...options,
      normalize: false,
    })
  },
  aggregate(results: MatchResult[], weights: number[]): MatchResult {
    let maxScore = 0
    let anyPassed = false
    let bestResult: MatchResult | null = null
    const details: MatchResultDetail[] = []

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.pass) anyPassed = true
      
      const weightedScore = r.score * (weights[i] || 0)
      if (weightedScore >= maxScore) {
        maxScore = weightedScore
        bestResult = r
      }
      
      if (r.details) {
        r.details.forEach(d => {
          d.weight = weights[i] || 0
          details.push(d)
        })
      }
    }

    if (anyPassed) {
      return {
        score: maxScore,
        pass: true,
        failures: [],
        details,
      }
    }

    // 全未通过时，生成汇总错误信息
    const failures: MatchResult['failures'] = [
      {
        message:
          `$or mismatch: none of the conditions met\n` +
          results
            .map(
              (r, i) =>
                `  Branch ${i}: ${r.failures.map((f) => f.message).join('; ')}`
            )
            .join('\n'),
        expected: results.map((r) => r.failures[0]?.expected),
        actual: results[0]?.failures[0]?.actual,
      },
    ]

    return {
      score: maxScore,
      pass: false,
      failures,
      details,
    }
  },
}

export const strategies: Record<string, ScoringStrategy> = {
  weighted: weightedSumStrategy,
  max: maxStrategy,
  and: weightedSumStrategy,
  or: maxStrategy,
}

export function getStrategy(name?: string): ScoringStrategy {
  if (!name) return weightedSumStrategy
  return strategies[name] || strategies.weighted
}
