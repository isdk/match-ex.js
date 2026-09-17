/**
 * Abstract base class for "this expected value is a JSON Schema".
 *
 * It exists to give the matching engine a dependency-free way to *identify* a
 * schema node, so that `core.ts` can dispatch to the schema branch without
 * importing a concrete (and heavy) implementation such as Ajv.
 *
 * Concrete implementations (e.g. {@link AjvSchemaType}) live behind a separate
 * entry point and are resolved lazily, which keeps Ajv out of the bundle for
 * consumers that never validate against a schema.
 */
export abstract class JsonSchemaType {
  /**
   * Stable type identifier used to recognise instances across module
   * instances / package duplicates, where `instanceof` would fail.
   */
  static readonly typeId = 'json-schema'

  /**
   * Type guard that works both for real instances and for objects created by
   * another copy of this class (e.g. duplicated in a bundle).
   */
  static isInstance(obj: any): obj is JsonSchemaType {
    if (!obj || typeof obj !== 'object') return false
    if (obj instanceof JsonSchemaType) return true
    return obj.constructor?.typeId === JsonSchemaType.typeId
  }

  /** Creates an instance from a raw schema, or returns it as-is if already one. */
  static create(schema?: any): JsonSchemaType {
    if (JsonSchemaType.isInstance(schema)) return schema
    return new (this as any)(schema)
  }

  /** Static helper: validates `data` against `schema` (raw object or instance). */
  static validate(schema: any, data: any): boolean {
    return (this as any).create(schema).validate(data)
  }

  /** Static helper: returns the validation errors of the last `validate()` call. */
  static getErrors(schema: any): any[] | null | undefined {
    return (this as any).create(schema).getErrors()
  }

  constructor(options?: any) {
    if (options) Object.assign(this, options)
  }

  /** Compiles/validates `data` against this schema. */
  abstract validate(data: any): boolean

  /** Returns the errors produced by the last `validate()` call. */
  abstract getErrors(): any[] | null | undefined
}
