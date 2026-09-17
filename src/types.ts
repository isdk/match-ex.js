import { Change } from 'diff'
import { template } from 'lodash-es'

/**
 * Supported diff strategies for string comparison.
 * - `auto`: Automatically detect the best diff strategy based on content.
 * - `chars`: Character-level diffing.
 * - `words`: Word-level diffing (ignoring whitespace).
 * - `wordsWithSpace`: Word-level diffing (including whitespace).
 * - `lines`: Line-level diffing.
 * - `sentences`: Sentence-level diffing.
 * - `json`: JSON-level diffing (serializes objects to JSON first).
 */
export type DiffType =
  | 'auto'
  | 'chars'
  | 'words'
  | 'wordsWithSpace'
  | 'lines'
  | 'sentences'
  | 'json'

/**
 * Represents a specific difference item in the validation process.
 * Extends the `Change` object from the `diff` library with additional validation metadata.
 */
export interface DiffItem extends Change {
  /**
   * The path in the object structure (e.g., "user.id" or "tags[0]").
   * Present when performing structured diffs (like JSON).
   */
  path?: string
  /**
   * The logical value associated with this change.
   * Present when performing structured diffs (like JSON).
   */
  val?: any
  /**
   * Indicates whether this specific change has been verified against the expected whitelist.
   * Internal use during the validation process.
   */
  verified?: boolean
  /**
   * If true, this change MUST be present in the actual output for the validation to pass.
   */
  required?: boolean
  /**
   * Scoring configuration for this specific diff item.
   */
  score?: ScoreConfig
}

/**
 * Represents a failure encountered during the validation of a value.
 */
export interface MatchFailure {
  /** The dot-separated path or array index where the failure occurred. */
  key?: string
  /** A human-readable message describing the failure. */
  message?: string
  /** The value that was expected at the given key. */
  expected?: any
  /** The actual value that was received. */
  actual?: any
  /** Detailed diff information if the failure occurred during a string comparison. */
  diff?: DiffItem[]
  /** Indicates if this failure occurred in a critical validation path. */
  critical?: boolean
}

/**
 * Configuration for scoring a validation item.
 * Can be a simple number (weight) or a detailed object.
 */
export type ScoreConfig =
  | number
  | {
      /** The relative weight or value of this item. Positive for rewards, negative for penalties. */
      value: number
      /** The dimension/tag this score belongs to (e.g. 'accuracy', 'security'). */
      dimension?: string
      /** If true, this item must pass for the overall test to pass, regardless of the score(red-line). */
      critical?: boolean
      /** The strategy used to calculate the score for this item's children. */
      strategy?: string
      /** The threshold for fuzzy matching. Only applicable for leaf nodes. */
      threshold?: number
      /** Additional options for the strategy. */
      [key: string]: any
    }

/**
 * The result returned by a validation operator or function.
 * - `boolean`: true -> pass (100%), false -> fail (0%).
 * - `string`: fail (0%) with message.
 * - `number`: pass with confidence score (0-1).
 * - `object`: detailed result with score and optional message.
 */
export type ValidationResult =
  | boolean
  | string
  | number
  | {
      /** The confidence score (0.0 - 1.0). */
      score: number
      /** Optional failure message. */
      message?: string
      /** Whether the validation is considered passed. Default depends on threshold. */
      pass?: boolean
      /** The dimension/tag this score belongs to. */
      dimension?: string
      /** Additional metadata. */
      [key: string]: any
    }

/**
 * Configuration for strict validation mode.
 *
 * - `true`: Enable strict mode for all types.
 * - `false`: Disable strict mode (partial matching).
 * - `'object' | 'diff' | 'array'`: Enable strict mode only for the specified type.
 * - `string[]`: Array of types to enable strict mode for.
 */
export type StrictOption = boolean | string | string[]

/**
 * Configuration options for string diffing.
 */
export interface DiffOptions {
  /**
   * The diff strategy to use.
   * Defaults to 'auto' when no whitelist is provided for better readability,
   * or 'chars' when a whitelist is provided for precision.
   */
  type?: DiffType
  /** A list of expected diff items (whitelist) to match against the actual changes. */
  items?: DiffItem[]
  /**
   * Whether to allow unverified diff changes in non-strict mode.
   * If true, changes not present in the `items` list will not cause a failure.
   */
  permissive?: boolean
  /** Whether to ignore case differences. */
  ignoreCase?: boolean
  /** (lines) Whether to ignore leading and trailing whitespace. */
  ignoreWhitespace?: boolean
  /** (lines) Whether to ignore a missing newline character at the end of the last line. */
  ignoreNewlineAtEof?: boolean
  /** (lines) Whether to treat the newline character at the end of each line as its own token. */
  newlineIsToken?: boolean
  /** (lines) Whether to remove all trailing CR characters. */
  stripTrailingCr?: boolean
  /** (words) Optional Intl.Segmenter for word-level diffing. */
  intlSegmenter?: any
}

/**
 * Loop metadata injected into `$each` iterations.
 *
 * Available inside `$expr` expressions and custom operators as the `loop`
 * scope variable, enabling handlebars-style `{{@index}}` / `{{@first}}` /
 * `{{@last}}` style logic.
 */
export interface ArrayLoopOptions {
  /** Whether this is the first iteration. */
  first: boolean
  /** Zero-based index of the current iteration. */
  index: number
  /** Whether this is the last iteration. */
  last: boolean
  /** Total number of items being iterated. */
  length: number
}

/**
 * Options for matching and validating values.
 */
export interface MatchValueOptions {
  /** The current key or path being validated. */
  key?: string
  /** Data context for template formatting. */
  data?: Record<string, any>
  /** The test fixture input/configuration. */
  input?: any
  /** Strict validation mode configuration. */
  strict?: StrictOption
  /** Whether to allow unverified diff changes in non-strict mode. */
  diffPermissive?: boolean
  /** Whether to disable heuristic JSON Schema recognition. Defaults to false. */
  disableHeuristicSchema?: boolean
  /** Custom validation operators. */
  operators?: Record<string, ValidationOperatorHandler>
  /** Whether to allow custom operators to override built-in ones. Defaults to false. */
  allowOperatorOverride?: boolean
  /** Whether the current key is actually present in the parent object. */
  isKeyPresent?: boolean
  /** Scoring mode configuration. */
  scoring?: boolean | 'auto'
  /** The maximum possible score. */
  maxScore?: number
  /** The minimum score required to pass. */
  passScore?: number
  /** The default weight for unassigned items. */
  unassignedWeight?: number
  /** The score allocated to this validation node from its parent. */
  allocatedScore?: number
  /** Whether the current validation branch is mandatory (Critical). */
  isCriticalBranch?: boolean
  /** The scoring strategy to use. */
  strategy?: ScoringStrategy
  /** The threshold for fuzzy matching. Only applicable for leaf nodes. */
  threshold?: number
  autoConfidence?: boolean|'force'
  /** The name of the operator currently being executed. */
  currentOperator?: string
  /** The virtual/path strategy of the current operator. */
  operatorStrategy?: boolean | string
  loop?: ArrayLoopOptions
  /** the root actual */
  actual?: any
}

/**
 * Manages the read-only configuration and context of a validation process.
 */
export class ValidationContext {
  /** The current hierarchical key or dot-separated path being validated. */
  key: string
  /** Data context used for template formatting and variable injection. */
  data: Record<string, any>
  /** The original test fixture input and configuration. */
  input: any
  /** Configuration for strict validation (e.g., forbidding extra keys). */
  strict?: StrictOption
  /** Whether to allow unverified diff changes in non-strict mode. */
  diffPermissive?: boolean
  /** Whether to disable heuristic JSON Schema recognition. */
  disableHeuristicSchema?: boolean
  /** Custom validation operators. */
  operators?: Record<string, ValidationOperatorHandler>
  /** Whether to allow custom operators to override built-in ones. */
  allowOperatorOverride?: boolean
  /** Whether the current key is actually present in the parent object. */
  isKeyPresent?: boolean
  /** Scoring mode configuration. */
  scoring?: boolean | 'auto'
  /** The maximum possible score. */
  maxScore: number
  /** The minimum score required to pass. */
  passScore: number
  /** The default weight for unassigned items. */
  unassignedWeight?: number
  /** The score allocated to this validation node from its parent. */
  allocatedScore: number
  /** Whether the current validation branch is mandatory (critical). */
  isCriticalBranch: boolean
  /** The scoring strategy to use. */
  strategy?: ScoringStrategy
  /** The threshold for fuzzy matching. Only applicable for leaf nodes. */
  threshold?: number
  autoConfidence?: boolean|'force'
  /** The name of the current operator. */
  currentOperator?: string
  /** The virtual strategy of the current operator. */
  operatorStrategy?: boolean | string
  loop?: ArrayLoopOptions
  /** the root actual */
  actual?: any

  /**
   * Creates a new validation context.
   * @param options - Initial options for the context.
   */
  constructor(options: MatchValueOptions = {}) {
    this.key = options.key || ''
    this.data = options.data || {}
    this.input = options.input
    this.strict = options.strict
    this.diffPermissive = options.diffPermissive
    this.disableHeuristicSchema = options.disableHeuristicSchema
    this.operators = options.operators
    this.allowOperatorOverride = options.allowOperatorOverride
    this.isKeyPresent = options.isKeyPresent
    this.scoring = options.scoring
    this.maxScore = options.maxScore ?? 100
    this.passScore = options.passScore ?? this.maxScore
    this.unassignedWeight = options.unassignedWeight
    this.allocatedScore = options.allocatedScore ?? this.maxScore
    this.isCriticalBranch = !!options.isCriticalBranch
    this.strategy = options.strategy
    this.threshold = options.threshold
    this.autoConfidence = options.autoConfidence
    this.currentOperator = options.currentOperator
    this.operatorStrategy = options.operatorStrategy
    if (options.loop) {this.loop = options.loop}
    this.actual = options.actual
  }

  /**
   * Creates a sub-context for a nested property or array element.
   * Handles path concatenation (e.g., appending '.prop' or '[index]').
   * @param subKey - The name of the sub-property or index (e.g., "name", "[0]").
   * @param options - Optional overrides for the sub-context.
   * @returns A new ValidationContext instance for the nested path.
   */
  createSubContext(
    subKey: string,
    options: Partial<MatchValueOptions> = {}
  ): ValidationContext {
    let newKey = this.key
    if (subKey) {
      if (subKey.startsWith('[') || !newKey) {
        newKey = `${newKey}${subKey}`
      } else {
        newKey = `${newKey}.${subKey}`
      }
    }
    return new ValidationContext({
      ...this,
      key: newKey,
      scoring: this.scoring,
      maxScore: this.maxScore,
      passScore: this.passScore,
      unassignedWeight: this.unassignedWeight,
      allocatedScore: this.allocatedScore,
      isCriticalBranch: this.isCriticalBranch,
      strategy: this.strategy,
      threshold: this.threshold,
      currentOperator: this.currentOperator,
      operatorStrategy: this.operatorStrategy,
      ...options,
    })
  }

  /**
   * Creates a high-level child context with automated path generation based on operator strategy.
   *
   * @param keyOrIndex - The key or index of the child item.
   * @param count - Total number of items in the container (used for single-element optimization).
   * @param options - Additional options.
   */
  createChildContext(
    keyOrIndex: string | number,
    count: number,
    options: Partial<MatchValueOptions> = {}
  ): ValidationContext {
    // Default to true (Virtual) if not specified
    const strategy = this.operatorStrategy ?? true
    let subKey = ''

    if (strategy !== false) {
      // Virtual mode
      if (count > 1) {
        // Default template distinguishes operators: e.g., $and[0]
        const templateStr = typeof strategy === 'string' ? strategy : '$operator[$key]'

        subKey = this.formatPathTemplate(templateStr, {
          key: String(keyOrIndex),
          index: typeof keyOrIndex === 'number' ? keyOrIndex : 0,
          count,
          operator: this.currentOperator || '',
        })
      }
      // If count === 1, subKey remains empty (inherits parent path)
    } else {
      // Non-transparent mode: Use traditional operator path style if possible,
      // or fall back to array-style for children
      subKey = `[${keyOrIndex}]`
    }

    return this.createSubContext(subKey, options)
  }

  private formatPathTemplate(tpl: string, data: any): string {
    try {
      // Use lodash template with custom interpolation for $key, $operator, etc.
      const compiled = template(tpl, { interpolate: /\$([a-zA-Z]+)/g })
      return compiled(data)
    } catch (e) {
      return `[${data.key}]` // Fallback
    }
  }

  /**
   * Calculates weights for a list of items using the current strategy and context.
   */
  distribute(items: (ScoreConfig | null)[]): number[] {
    if (!this.strategy) {
      throw new Error('Scoring strategy not found in ValidationContext. Ensure it is initialized correctly.')
    }
    return this.strategy.distribute(items, {
      totalUnassignedWeight: this.unassignedWeight,
      maxScore: this.maxScore,
      autoConfidence: this.autoConfidence,
    })
  }

  /**
   * Aggregates multiple MatchResults using the current strategy.
   */
  aggregate(results: MatchResult[], weights: number[]): MatchResult {
    if (!this.strategy) {
      throw new Error('Scoring strategy not found in ValidationContext.')
    }
    return this.strategy.aggregate(results, weights)
  }
}

/**
 * Interface for a scoring strategy.
 * Defines how scores are distributed to children and aggregated back to the parent.
 */
export interface ScoringStrategy {
  /**
   * Calculates the weights for a list of items.
   * @param items - The items to distribute score to.
   * @param options - Contextual options.
   * @returns An array of normalized weights (0.0 - 1.0) summing to 1.0 (for weighted) or more (for independent).
   */
  distribute(
    items: (ScoreConfig | null)[],
    options?: { totalUnassignedWeight?: number; maxScore?: number, autoConfidence?: boolean|'force' }
  ): number[]

  /**
   * Aggregates the results from child matches into a single result.
   * @param results - The results from child validations.
   * @param weights - The weights corresponding to each child.
   * @param options - Additional aggregation options.
   */
  aggregate(
    results: MatchResult[],
    weights: number[],
    options?: any
  ): MatchResult
}

/**
 * Signature for the core match validation function used recursively by operators.
 */
export type ValidateMatchFn = (
  actual: any,
  expected: any,
  ctx: ValidationContext
) => Promise<MatchResult>

/**
 * Result of a validation match operation.
 */
export interface MatchResult {
  /** The normalized confidence score (0.0 - 1.0). */
  score: number
  /** Whether the validation passed. */
  pass: boolean
  /** List of failures encountered during matching. */
  failures: MatchFailure[]
  /** Detailed scoring breakdown for sub-items. */
  details?: MatchResultDetail[]
  /** Optional title of the validation item. */
  title?: string
  /** Optional dimension/tag. */
  dimension?: string
  /** Whether this was a critical item. */
  critical?: boolean
}

/**
 * Detailed information about a single validation item's score.
 */
export interface MatchResultDetail {
  /** The key/path of the item. */
  key: string
  /** The descriptive title. */
  title?: string
  /** The dimension/tag. */
  dimension?: string
  /** The earned score (0.0 - 1.0, relative to allocated weight). */
  score: number
  /** The allocated weight (normalized 0.0 - 1.0). */
  weight: number
  /** Whether this specific item passed. */
  pass: boolean
  /** Whether this item was a critical/red-line item. */
  critical?: boolean
  /** Recursive sub-details for nested objects/arrays. */
  details?: MatchResultDetail[]
}

/**
 * Function signature for handling custom validation operators (e.g., $contains).
 */
export type ValidationOperatorHandler = ((
  actual: any,
  expected: any,
  ctx: ValidationContext,
  validateMatch: ValidateMatchFn
) => Promise<ValidationResult> | ValidationResult) & {
  virtual?: boolean | string
  strategy?: string
}

