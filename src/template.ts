import { omit } from 'lodash-es'

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
  /** Any other option is forwarded to the underlying template engine. */
  [name: string]: any
}

/**
 * Minimal contract the engine needs from a template engine.
 */
export interface StringTemplateLike {
  formatIf(options: Record<string, any>): Promise<any> | any
}

let _stringTemplate: StringTemplateLike | undefined

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
 * @throws If no implementation was registered before the first interpolation.
 */
export function getStringTemplate(): StringTemplateLike {
  if (!_stringTemplate) {
    throw new Error(
      'Template interpolation requires a registered implementation. ' +
        'Register one via setStringTemplate(), e.g. by importing ' +
        '"@isdk/match-ex-template".'
    )
  }
  return _stringTemplate
}

/**
 * Registers a custom template implementation. Useful to plug in a different
 * dialect or to avoid the dependency entirely.
 */
export function setStringTemplate(impl: StringTemplateLike): void {
  _stringTemplate = impl
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
    if (value instanceof RegExp) {
      vRegEx = value
      value = value.source
    }
    if (typeof value === 'string') {
      const data = { ...options.data, ...options.input }
      const formatOptions = omit(options, ['data', 'input'])
      const StringTemplate = getStringTemplate()
      const content = await StringTemplate.formatIf({
        raw: true,
        template: value,
        ...formatOptions,
        data,
      })
      if (content !== undefined) {
        value = content
      }
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
