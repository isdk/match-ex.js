import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'
import { isJsonSchema, validateJsonSchema } from '../src/schema.js'
import { JsonSchemaType } from '../src/schema-type.js'

describe('isJsonSchema heuristic', () => {
  it('识别真正的 JSON Schema', () => {
    expect(isJsonSchema({ type: 'string' })).toBe(true)
    expect(isJsonSchema({ type: 'number', minimum: 5 })).toBe(true)
    expect(isJsonSchema({ type: 'array', minItems: 2 })).toBe(true)
    expect(isJsonSchema({ type: ['string', 'null'] })).toBe(true)
    expect(isJsonSchema({
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer' } },
    })).toBe(true)
    expect(isJsonSchema({ $ref: '#/defs/x' })).toBe(true)
    expect(isJsonSchema({ allOf: [{ type: 'string' }] })).toBe(true)
    expect(isJsonSchema({ type: 'string', title: 't', description: 'd' })).toBe(true)
  })

  it('不把领域对象 / 普通期望对象误判为 Schema', () => {
    // 仅仅带一个 `type` 字段的业务对象：必须按字面量匹配
    expect(isJsonSchema({ type: 'object', name: 'x' })).toBe(false)
    expect(isJsonSchema({ type: 'string', value: 'x' })).toBe(false)
    expect(isJsonSchema({ type: 'button' })).toBe(false)
    expect(isJsonSchema({ type: 'my-custom-type' })).toBe(false)
    expect(isJsonSchema({ type: 'admin' })).toBe(false)
  })

  it('不把算子对象误判为 Schema', () => {
    expect(isJsonSchema({ type: 'object', $contains: 'foo' })).toBe(false)
    expect(isJsonSchema({ $and: [{ $gt: 1 }], type: 'string' })).toBe(false)
    expect(isJsonSchema({ $schema: { type: 'string' } })).toBe(false)
    expect(isJsonSchema({ $not: 'x' })).toBe(false)
  })

  it('非对象一律返回 false', () => {
    expect(isJsonSchema(null)).toBe(false)
    expect(isJsonSchema(undefined)).toBe(false)
    expect(isJsonSchema('string')).toBe(false)
    expect(isJsonSchema(123)).toBe(false)
    expect(isJsonSchema([])).toBe(false)
    expect(isJsonSchema({})).toBe(false)
  })

  it('JsonSchemaType 实例恒为 true', () => {
    class Impl extends JsonSchemaType {
      validate(): boolean { return true }
      getErrors() { return null }
    }
    expect(isJsonSchema(new Impl({ type: 'string' }))).toBe(true)
  })
})

describe('schema validation correctness', () => {
  it('不再因启发式 + 宽松 Ajv 而误通过（值不同必须失败）', async () => {
    const { pass, failures } = await validate(
      { type: 'object', name: 'y' },
      { type: 'object', name: 'x' },
      new ValidationContext()
    )
    expect(pass).toBe(false)
    expect(failures.length).toBeGreaterThan(0)
  })

  it('拼错的 schema 关键字不再被忽略导致误通过', async () => {
    // `minLen` 不是 schema 关键字 -> 整体不是 schema -> 走对象匹配 -> 失败
    const { pass } = await validate('abc', { type: 'string', minLen: 5 } as any, new ValidationContext())
    expect(pass).toBe(false)
  })

  it('合法的 schema 仍然正常校验', async () => {
    expect((await validate('abc', { type: 'string', minLength: 2 }, new ValidationContext())).pass).toBe(true)
    const { pass, failures } = await validate('a', { type: 'string', minLength: 2 }, new ValidationContext())
    expect(pass).toBe(false)
    expect(failures[0].message).toBe('JSON Schema validation failed')
  })

  it('不可编译的 schema 产出失败而不是静默通过', async () => {
    const { score, pass, failures } = await validate(
      'abc',
      { type: 'string', pattern: '[' } as any,
      new ValidationContext()
    )
    expect(pass).toBe(false)
    expect(score).toBe(0)
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toContain('Invalid JSON Schema')
  })

  it('$schema 算子遇到不可编译的 schema 同样失败', async () => {
    const { pass, failures } = await validate(
      'abc',
      { $schema: { type: 'stirng' } } as any,
      new ValidationContext()
    )
    expect(pass).toBe(false)
    expect(failures[0].message).toContain('Invalid JSON Schema')
  })

  it('validateJsonSchema 对合法 schema 返回通过', async () => {
    const res = await validateJsonSchema(123, { type: 'number' }, new ValidationContext())
    expect(res.pass).toBe(true)
    expect(res.failures).toHaveLength(0)
  })
})
