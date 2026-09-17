import { ValidationResult } from '../types.js'
import { ValidationContext, ValidateMatchFn } from '../types.js'
import { orderBy, omit } from 'lodash-es'
import { newFunction } from 'util-ex'

type IterateeFn = (item: any, index: number, array: any[]) => any | Promise<any>

interface SortByConfig {
  iteratee: IterateeFn
  order: 'asc' | 'desc'
}

/**
 * Creates a sorting iteratee and its order from various input types.
 */
function createSortConfig(entry: any, ctx: ValidationContext): SortByConfig | null {
  if (typeof entry === 'string') {
    const isDesc = entry.startsWith('-')
    const field = isDesc ? entry.substring(1) : entry
    return {
      iteratee: (item: any) => item?.[field],
      order: isDesc ? 'desc' : 'asc',
    }
  }

  if (typeof entry === 'function') {
    return {
      iteratee: entry as IterateeFn,
      order: 'asc',
    }
  }

  if (entry && typeof entry === 'object' && '$expr' in entry) {
    const expr = entry.$expr
    const order = entry.order || 'asc'
    return {
      iteratee: async (item: any, index: number, array: any[]) => {
        const fn = newFunction(expr, {
          item,
          actual: item, // compatibility with expr.ts
          index,
          array,
          data: ctx.data,
          input: ctx.input,
          ctx,
        })
        return await fn()
      },
      order,
    }
  }

  return null
}

/**
 * Performs a stable sort on an array with support for async iteratees.
 * Uses the "Schwartzian transform" pattern to handle async key extraction.
 */
async function asyncOrderBy(
  array: any[],
  configs: SortByConfig[]
): Promise<any[]> {
  if (configs.length === 0) return [...array]

  // Pre-calculate all keys (potentially asynchronously)
  const itemsWithKeys = await Promise.all(
    array.map(async (item, index) => {
      const keys = await Promise.all(
        configs.map((config) => config.iteratee(item, index, array))
      )
      return { item, keys }
    })
  )

  // Sort based on pre-calculated keys using lodash.orderBy
  const sortedWrappers = orderBy(
    itemsWithKeys,
    configs.map((_, i) => (wrapper: any) => wrapper.keys[i]),
    configs.map((config) => config.order)
  )

  return sortedWrappers.map((w) => w.item)
}

/**
 * Validates that the remaining expectations pass after sorting the actual array.
 * 
 * @example
 * "$sort": {
 *   "$by": "-createdAt", // or ["category", "-score"]
 *   "$sequence": [ ... ]
 * }
 * 
 * // Advanced usage:
 * "$sort": {
 *   "$by": [
 *     { "$expr": "item.score * 1.2", "order": "desc" },
 *     (item) => item.name
 *   ],
 *   "$first": { "name": "Best" }
 * }
 */
export async function validateSort(
  actual: any,
  expected: any,
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
): Promise<ValidationResult> {
  if (!Array.isArray(actual)) {
    return {
      score: 0,
      pass: false,
      message: '$sort mismatch: actual value is not an array',
      expected,
      actual,
    }
  }

  const by = expected.$by
  const configs: SortByConfig[] = []

  // 1. Parse configuration
  const entries = Array.isArray(by) ? by : by !== undefined ? [by] : []
  for (const entry of entries) {
    const config = createSortConfig(entry, ctx)
    if (config) {
      configs.push(config)
    } else {
      return {
        score: 0,
        pass: false,
        message: '$sort mismatch: $by entry must be a string, function, or expression object',
        expected,
        actual,
      }
    }
  }

  // 2. Execute sorting
  let sortedActual: any[]
  try {
    if (configs.length > 0) {
      sortedActual = await asyncOrderBy(actual, configs)
    } else if (by !== undefined) {
      // Edge case: empty array $by: [] -> natural sort
      sortedActual = [...actual].sort()
    } else {
      sortedActual = actual
    }
  } catch (err: any) {
    return {
      score: 0,
      pass: false,
      message: `$sort evaluation error: ${err.message}`,
      expected,
      actual,
    }
  }

  // 3. Delegate validation
  const restExpected = omit(expected, ['$by'])
  const nextCtx = ctx.createSubContext('')
  nextCtx.allocatedScore = ctx.allocatedScore

  return (await validateMatch(sortedActual, restExpected, nextCtx)) as ValidationResult
}

validateSort.virtual = true
