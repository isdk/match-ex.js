import { get as getByPath, has as hasByPath, cloneDeep } from 'lodash-es'
import { MatchFailure } from './types.js'
import {
  MatchValueOptions,
  ValidationContext,
  MatchResult,
  MatchResultDetail,
  ArrayLoopOptions,
} from './types.js'
import {
  isStrict,
  processValidationResult,
  patchMatchResult,
  getScoreConfig,
  isMetadataKey,
  META_CONTAINER,
  META_SHORTHANDS,
  isRegExp,
  toRegExp,
} from './utils.js'
import { formatTemplate, formatObject } from './template.js'
import { isJsonSchema, validateJsonSchema, getJsonSchemaType } from './schema.js'
import { OPERATORS } from './operators.js'
import { validateStringDiff } from './diff.js'
import { JsonSchemaType } from './schema-type.js'
import { getStrategy } from './strategies.js'


/**
 * Validates that an actual value matches an expected value.
 * This is the public entry point that returns MatchResult (Pure).
 */
export async function validate(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  // Ensure default strategy if missing
  if (!ctx.strategy) {
    ctx.strategy = getStrategy('weighted')
  }
  if (!ctx.actual) {
    ctx.actual = actual
  }

  const { input, data } = ctx
  const scoreCfg = getScoreConfig(expected)

  if (typeof actual === 'string') {
    actual = actual.trim()
  }

  // 1. Template formatting
  let vType = typeof expected
  if (vType === 'string') {
    expected = await formatTemplate(expected, {
      data,
      input,
      templateFormat: data?.templateFormat,
    })
    vType = typeof expected
  }

  let finalResult: MatchResult

  // 2. Operator Detection (Same as original code logic)
  let isPureOperator = false
  let operator: string | undefined
  let operatorHandler: any

  if (
    vType === 'object' &&
    expected !== null &&
    !(expected instanceof RegExp) &&
    !JsonSchemaType.isInstance(expected)
  ) {
    const keys = Object.keys(expected)
    if (ctx.allowOperatorOverride) {
      operator = keys.find((k) => ctx.operators?.[k] || OPERATORS[k])
      operatorHandler = ctx.operators?.[operator!] || OPERATORS[operator!]
    } else {
      operator = keys.find((k) => OPERATORS[k])
      if (operator) {
        operatorHandler = OPERATORS[operator]
      } else {
        operator = keys.find((k) => ctx.operators?.[k])
        operatorHandler = ctx.operators?.[operator!]
      }
    }

    if (operator) {
      const otherKeys = keys.filter(
        (k) => k !== operator && !isMetadataKey(k, expected)
      )
      if (
        keys.length === 1 ||
        operator === '$expect' ||
        otherKeys.length === 0
      ) {
        isPureOperator = true
      }
    }
  }

  // 3. Dispatch Chain (Mirroring the EXACT priority of the original code)
  if (isPureOperator) {
    finalResult = await validateOperator(actual, expected, operator!, operatorHandler, ctx)
  } else if (isRegExp(expected)) {
    finalResult = await validateRegExp(actual, expected, ctx)
  } else if (vType === 'string') {
    finalResult = await validateString(actual, expected, ctx)
  } else if (Array.isArray(expected)) {
    finalResult = await validateArray(actual, expected, ctx)
  } else if (vType === 'function') {
    finalResult = await validateFunction(actual, expected, ctx)
  } else if (JsonSchemaType.isInstance(expected)) {
    finalResult = await validateSchema(actual, expected, ctx)
  } else if (!ctx.disableHeuristicSchema && isJsonSchema(expected)) {
    /**
     * 【启发式 Schema 的降级】
     * 只有显式 Schema（JsonSchemaType 实例、`$schema` 算子）在缺少实现时才算硬错误；
     * 启发式命中的普通对象在缺少实现时回退为对象匹配，避免"看起来像 schema"的
     * 期望值把整棵匹配树打崩。
     */
    finalResult = getJsonSchemaType()
      ? await validateSchema(actual, expected, ctx)
      : await validateObject(actual, expected, ctx)
  } else if (vType === 'object') {
    finalResult = await validateObject(actual, expected, ctx)
  } else {
    finalResult = await validatePrimitive(actual, expected, ctx)
  }

  /**
   * 【极致路径自动化核心逻辑】
   * 在每一层递归出口，根据当前上下文的 key 和配置的元数据修补结果。
   * 这保证了无论算子如何实现，路径追踪和元数据传递始终一致且自动。
   */
  return patchMatchResult(finalResult, scoreCfg, ctx.key)
}

/**
 * Legacy wrapper for backward compatibility.
 * @deprecated Use validate() instead. validate() is a pure function that returns a MatchResult.
 */
export async function validateMatch(
  actual: any,
  expected: any,
  options: MatchValueOptions | ValidationContext = {}
): Promise<MatchFailure[]> {
  const ctx =
    options instanceof ValidationContext
      ? options
      : new ValidationContext(options)

  const result = await validate(actual, expected, ctx)

  if (!(options instanceof ValidationContext) && Array.isArray((options as any).failures)) {
    (options as any).failures.push(...result.failures)
  }

  return result.failures
}

async function validateOperator(
  actual: any,
  expected: any,
  operator: string,
  operatorHandler: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  const scoreCfg = getScoreConfig(expected)
  const isCritical = scoreCfg.critical
  const weight = scoreCfg.weight ?? 1

  /**
   * 【算子路径策略自动化】
   * 默认为虚拟模式 (true)，核心引擎不在当前路径增加层级。
   * Handler 内部通过 createChildContext 自动化处理子路径（支持变量模板）。
   */
  const strategy = operatorHandler.virtual ?? true
  const isVirtual = strategy !== false

  /**
   * 【策略绑定优先级】
   * 1. 算子内置策略 (operatorHandler.strategy) - 保证算子逻辑完整性（如 $or 必须是 max）
   * 2. 用户显式配置 (scoreCfg.strategy) - 用户对当前区块的定制要求
   * 3. 上下文继承 (ctx.strategy) - 继承自父级的默认行为
   */
  const opStrategyName = operatorHandler.strategy || scoreCfg.strategy
  const opStrategy = opStrategyName ? getStrategy(opStrategyName) : ctx.strategy

  const opCtx = ctx.createSubContext(isVirtual ? '' : operator, {
    isCriticalBranch: ctx.isCriticalBranch || isCritical,
    threshold: scoreCfg.threshold ?? ctx.threshold,
    currentOperator: operator,
    operatorStrategy: strategy,
    strategy: opStrategy,
  })

  let val = expected[operator]
  val = await formatObject(cloneDeep(val), { data: ctx.data, input: ctx.input })

  const operatorResult = await operatorHandler(
    actual,
    val,
    opCtx,
    validate
  )

  return processValidationResult(
    operatorResult,
    val,
    actual,
    opCtx
  )
}

async function validateRegExp(
  actual: any,
  expected: RegExp,
  ctx: ValidationContext
): Promise<MatchResult> {
  const { data, input } = ctx
  const regEx = await formatTemplate(toRegExp(expected), {
    data,
    input,
    templateFormat: data?.templateFormat,
  })
  const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual)

  if (regEx.test(actualStr)) {
    return { score: 1, pass: true, failures: [] }
  } else {
    const regStr = regEx.toString()
    return processValidationResult(
      {
        score: 0,
        pass: false,
        message: `RegExp mismatch: expected ${regStr}, but got ${JSON.stringify(actual)}`,
      },
      regStr,
      actual,
      ctx
    )
  }
}

async function validateString(
  actual: any,
  expected: string,
  ctx: ValidationContext
): Promise<MatchResult> {
  const { input } = ctx
  const hasDiffReq = !!input?.diff
  const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual)

  if (
    !hasDiffReq &&
    typeof actual === 'string' &&
    actualStr.includes(expected.trim())
  ) {
    return { score: 1, pass: true, failures: [] }
  } else if (typeof actual === 'string') {
    return validateStringDiff(actual, expected, ctx)
  } else {
    return processValidationResult(
      {
        score: 0,
        pass: false,
        message: 'Value mismatch',
      },
      expected,
      actual,
      ctx
    )
  }
}

/**
 * Array Validation
 * 核心逻辑：为数组中的每一项分配权重并递归校验。
 */
async function validateArray(
  actual: any,
  expected: any[],
  ctx: ValidationContext
): Promise<MatchResult> {
  if (!Array.isArray(actual)) {
    return processValidationResult(
      { score: 0, pass: false, message: 'Type mismatch: expected Array' },
      expected, actual, ctx
    )
  }

  if (isStrict('array', ctx) && actual.length !== expected.length) {
    return processValidationResult(
      { score: 0, pass: false, message: `Array length mismatch (strict mode): expected ${expected.length}, actual ${actual.length}` },
      expected.length, actual.length, ctx
    )
  }

  const explicitWeights = expected.map((item) => getScoreConfig(item).weight)
  const weights = ctx.distribute(explicitWeights)

  const subResults: MatchResult[] = []
  for (let i = 0; i < expected.length; i++) {
    const scoreCfg = getScoreConfig(expected[i])
    const subCtx = ctx.createSubContext(`[${i}]`, {
      isCriticalBranch: ctx.isCriticalBranch || scoreCfg.critical
    })
    subCtx.allocatedScore = weights[i] * ctx.allocatedScore
    const subResult = await validate(actual[i], expected[i], subCtx)
    subResults.push(subResult)
  }

  return ctx.aggregate(subResults, weights)
}

async function validateFunction(
  actual: any,
  expected: Function,
  ctx: ValidationContext
): Promise<MatchResult> {
  const funcResult = await expected(actual, ctx.input)
  return processValidationResult(
    funcResult,
    expected,
    actual,
    ctx
  )
}

async function validateSchema(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  if (!JsonSchemaType.isInstance(expected)) {
    expected = await formatObject(cloneDeep(expected), { data: ctx.data, input: ctx.input })
  }
  return validateJsonSchema(actual, expected, ctx)
}

/**
 * Object Validation
 * 核心逻辑：为对象的每个属性分配权重并递归校验。
 */
async function validateObject(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  if (expected === null) {
    return actual === null ? { score: 1, pass: true, failures: [] } : processValidationResult({ score: 0, pass: false, message: 'Value equality check failed' }, null, actual, ctx)
  } else if (actual === null || typeof actual !== 'object') {
     return processValidationResult({ score: 0, pass: false, message: 'Value equality check failed' }, expected, actual, ctx)
  }

  const allKeys = Object.keys(expected).filter((k) => {
    if (isMetadataKey(k, expected)) return false
    // Filter out registered operators
    if (ctx.operators?.[k] || OPERATORS[k]) return false
    return true
  })
  const matchedActualKeys = new Set<string>()

  const explicitWeights = allKeys.map((k) => {
    const item = expected[k]
    return getScoreConfig(item).weight
  })

  const weights = ctx.distribute(explicitWeights)

  const subResults: MatchResult[] = []

  for (let i = 0; i < allKeys.length; i++) {
    const k = allKeys[i]
    const v = expected[k]
    let actualValue: any
    let matchedKey: string | undefined
    let isKeyPresent = false

    if (k.startsWith('/') && k.endsWith('/')) {
      const reg = new RegExp(k.slice(1, -1))
      matchedKey = Object.keys(actual).find((ak) => reg.test(ak))
      if (matchedKey) {
        actualValue = actual[matchedKey]
        matchedActualKeys.add(matchedKey)
        isKeyPresent = true
      }
    } else {
      actualValue = getByPath(actual, k)
      isKeyPresent = hasByPath(actual, k)
      if (isKeyPresent || actualValue !== undefined) {
        matchedKey = k
        matchedActualKeys.add(k.split('.')[0].split('[')[0])
      }
    }

    const scoreCfg = getScoreConfig(v)
    const subCtx = ctx.createSubContext(matchedKey || k, {
      isKeyPresent,
      isCriticalBranch: ctx.isCriticalBranch || scoreCfg.critical
    })
    subCtx.allocatedScore = weights[i] * ctx.allocatedScore
    const subResult = await validate(actualValue, v, subCtx)
    subResults.push(subResult)
  }

  // Strict mode check...
  if (isStrict('object', ctx)) {
    const actualKeys = Object.keys(actual)
    const extraFailures: MatchResult[] = []
    for (const ak of actualKeys) {
      if (!matchedActualKeys.has(ak)) {
        extraFailures.push(processValidationResult(
          { score: 0, pass: false, message: 'Extra key in actual object (strict mode)' },
          undefined, actual[ak], ctx.createSubContext(ak)
        ))
      }
    }
    if (extraFailures.length > 0) {
        const aggregated = ctx.aggregate(subResults, weights)
        return {
           ...aggregated,
           pass: false,
           failures: [...aggregated.failures, ...extraFailures.flatMap(f => f.failures)]
        }
    }
  }

  return ctx.aggregate(subResults, weights)
}

async function validatePrimitive(
  actual: any,
  expected: any,
  ctx: ValidationContext
): Promise<MatchResult> {
  if (actual === expected) {
    return { score: 1, pass: true, failures: [] }
  } else {
    return processValidationResult({ score: 0, pass: false }, expected, actual, ctx)
  }
}
