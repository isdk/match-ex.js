import { Ajv, ValidateFunction } from 'ajv'
import ajvKeywords from 'ajv-keywords'
import ajvFormats from 'ajv-formats'
import { JsonSchemaType } from './schema-type.js'

/**
 * Global Ajv instance used for schema compilation.
 * Configured with `strictSchema: false` to allow for flexible YAML-based schemas.
 */
const ajv = new Ajv({ strictSchema: false })

// @ts-expect-error "typeof ajvKeywords"
ajvKeywords(ajv)
// @ts-expect-error "typeof ajvFormats"
ajvFormats(ajv)

/** Symbol for storing the compiled validation function privately on instances. */
const ValidateSymbol = Symbol('validate')

/**
 * Ajv-backed {@link JsonSchemaType} implementation.
 *
 * This is the only module in the matching engine that touches Ajv. It is
 * loaded lazily so that consumers which never validate a schema never pay for
 * it.
 */
export class AjvSchemaType extends JsonSchemaType {
  /** @internal Compiled Ajv validation function. */
  declare [ValidateSymbol]: ValidateFunction<any>

  constructor(options?: any) {
    super(options)

    Object.defineProperty(this, ValidateSymbol, {
      writable: false,
      enumerable: false,
      value: ajv.compile<any>(this.toJSON()),
    })
  }

  /**
   * Converts the instance to a plain JSON object suitable for Ajv compilation.
   * Filters out internal properties (starting with '_').
   */
  toJSON() {
    // filter private properties
    return Object.fromEntries(
      Object.entries(this).filter(([k]) => !k.startsWith('_'))
    )
  }

  validate(data: any): boolean {
    return this[ValidateSymbol](data)
  }

  getErrors() {
    return this[ValidateSymbol].errors
  }
}
