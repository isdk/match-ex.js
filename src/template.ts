import { omit } from 'lodash-es'
import { getRegistry } from './registry.js'

/**
 * Options accepted by {@link formatTemplate} and {@link formatObject}.
 *
 * This is the local counterpart of `StringTemplateOptions` from
 * `@isdk/template-engines`. Keeping it local means the matching engine does not
 * have to depend on that package's type surface at build time.
 */
export interface TemplateOptions {
  /** The template string to be formatted. Defaults to the value being formatted. */
  template?: string
  /** Data context used for template interpolation. */
  data?: Record<string, any>
  /** Extra values merged over `data` (typically the fixture `input`). */
  input?: Record<string, any>
  /**
   * Template dialect to use.
   * One of `default` | `fstring` | `golang` | `env` | `hf`.
   */
  templateFormat?: string
  /**
   * If true, returns the raw value (Object, Array, Boolean, …) instead of a
   * string when the whole template is a single placeholder (e.g. `{{user}}`).
   * Defaults to true.
   */
  raw?: boolean
  /**
   * Whether to expand a substituted value as a template when it is itself a
   * template, enabling recursive rendering. Defaults to true.
   */
  expandValue?: boolean
  /**
   * Set to `false` to always run the template engine, even for values without
   * any placeholder marker. Only needed for engines with a syntax outside of
   * `{{ }}` / `{name}` / `$VAR` / `<%= %>`.
   * Defaults to true.
   */
  skipPlainValue?: boolean
  /** Any other option is forwarded to the underlying template engine. */
  [name: string]: any
}

/**
 * Minimal contract the engine needs from a template engine.
 */
export interface StringTemplateLike {
  formatIf(options: Record<string, any>): Promise<any> | any
}

/**
 * Returns the registered template implementation, or `undefined` if the host
 * registered none.
 *
 * Internal: the engine degrades to literal matching in that case, so a missing
 * plugin never breaks plain matching (see {@link formatTemplate}).
 */
export function peekStringTemplate(): StringTemplateLike | undefined {
  return getRegistry().stringTemplate
}

/**
 * Returns the registered template implementation.
 *
 * The engine ships no template engine of its own. Register one via
 * {@link setStringTemplate} — the `@isdk/match-ex-template` plugin does
 * exactly that by importing `StringTemplate` from `@isdk/template-engines`:
 *
 * ```ts
 * import '@isdk/match-ex-template'
 * ```
 *
 * @throws If no implementation was registered. Callers that only want to
 * interpolate "if possible" must use {@link peekStringTemplate} instead.
 */
export function getStringTemplate(): StringTemplateLike {
  const impl = peekStringTemplate()
  if (!impl) {
    throw new Error(
      'Template interpolation requires a registered implementation. ' +
        'Register one via setStringTemplate(), e.g. by importing ' +
        '"@isdk/match-ex-template".'
    )
  }
  return impl
}

/**
 * Registers a custom template implementation. Useful to plug in a different
 * dialect or to avoid the dependency entirely.
 *
 * Passing `undefined`/`null` unregisters the current implementation, which
 * switches the engine back to literal (no interpolation) matching.
 */
export function setStringTemplate(
  impl: StringTemplateLike | undefined | null
): void {
  getRegistry().stringTemplate = impl || undefined
}

/**
 * Characters that can open a placeholder in any dialect the engine knows
 * about: `{{ }}` (default / golang / hf), `{name}` (f-string), `$VAR` and
 * `${VAR}` (env), `<%= %>` (ejs/erb). A value containing none of them cannot
 * be interpolated by anything, so the template engine is skipped entirely.
 */
const PLACEHOLDER_MARKER_RE = /[{<$]/

/**
 * Whether `value` provably contains no template placeholder.
 */
export function isPlainValue(value: string): boolean {
  return !PLACEHOLDER_MARKER_RE.test(value)
}

/**
 * Formats a single value (string or RegExp) using the template engine.
 * It merges context data and input parameters to resolve template placeholders.
 *
 * @param value - The value containing templates (e.g., "Hello {{name}}").
 * @param options - Template formatting options including data and input.
 * @returns The formatted string or RegExp with placeholders replaced.
 */
export async function formatTemplate(
  value: any,
  options: TemplateOptions = {}
): Promise<any> {
  if (options.data) {
    let vRegEx: RegExp | undefined
    let text: string | undefined
    if (value instanceof RegExp) {
      vRegEx = value
      text = value.source
    } else if (typeof value === 'string') {
      text = value
    }
    if (text === undefined) return value

    /**
     * 【未注册模板则降级为字面量】
     * 核心不依赖任何模板引擎：没有注册实现时，期望值按字面量参与匹配，
     * 而不是让整棵匹配树抛错。
     */
    const StringTemplate = peekStringTemplate()
    if (!StringTemplate) return value

    /** 没有任何占位符特征时同样不启用插值（纯文本快速路径）。 */
    if (options.skipPlainValue !== false && isPlainValue(text)) return value

    const data = { ...options.data, ...options.input }
    const formatOptions = omit(options, ['data', 'input', 'skipPlainValue'])
    const content = await StringTemplate.formatIf({
      raw: true,
      template: text,
      ...formatOptions,
      data,
    })
    if (content !== undefined) {
      value = content
    }
    if (vRegEx) {
      if (vRegEx.source !== value) {
        value = new RegExp(value, vRegEx.flags)
      } else {
        value = vRegEx
      }
    }
  }
  return value
}

/**
 * Recursively formats an object or array by applying the template engine to
 * string and RegExp values.
 * Also handles template resolution for object keys.
 *
 * @param input - The object or array to format.
 * @param options - Template formatting options.
 * @returns A new structure with all templates resolved.
 */
export async function formatObject(
  input: any,
  options: TemplateOptions = {}
): Promise<any> {
  if (input && options.data) {
    if (typeof input === 'string' || input instanceof RegExp) {
      input = await formatTemplate(input, options)
    }

    if (Array.isArray(input)) {
      for (let i = 0; i < input.length; i++) {
        const vItem = input[i]
        const actualItem = await formatObject(vItem, options)
        if (actualItem !== vItem) {
          input[i] = actualItem
        }
      }
    } else if (
      input &&
      typeof input === 'object' &&
      !(input instanceof RegExp)
    ) {
      const keys = Object.keys(input)
      for (const k of keys) {
        const newK = await formatTemplate(k, options)
        const v = input[k]
        const actualValue = await formatObject(v, options)
        if (actualValue !== v || String(newK) !== k) {
          delete input[k]
          input[String(newK)] = actualValue
        }
      }
    }
  }
  return input
}
