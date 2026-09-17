import { describe, it, expect, afterEach, vi } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'
import {
  formatTemplate,
  formatObject,
  getStringTemplate,
  setStringTemplate,
  isPlainValue,
} from '../src/template.js'
import { getJsonSchemaType, setJsonSchemaType } from '../src/schema.js'
import { JsonSchemaType } from '../src/schema-type.js'
import { REGISTRY_KEY } from '../src/registry.js'

/**
 * 插件注册表测试：核心不内置模板引擎 / Schema 校验器，
 * 未注册时不得让匹配校验崩溃，必须降级为字面量 / 普通对象匹配。
 *
 * setupVitest.mjs 已经预注册了真实实现，这里在用例内反注册并负责恢复。
 */
const originalTemplate = getStringTemplate()
const originalSchemaCtor = getJsonSchemaType()

afterEach(() => {
  setStringTemplate(originalTemplate)
  setJsonSchemaType(originalSchemaCtor)
})

describe('plugin registry / 未注册模板时降级为字面量', () => {
  it('未注册模板：普通字符串匹配仍然通过', async () => {
    setStringTemplate(null)
    const { pass, failures } = await validate('hello world', 'hello', new ValidationContext())
    expect(pass).toBe(true)
    expect(failures).toHaveLength(0)
  })

  it('未注册模板：字符串不匹配时仍然正常产出 diff 失败', async () => {
    setStringTemplate(null)
    const { pass, failures } = await validate('abc', 'abd', new ValidationContext())
    expect(pass).toBe(false)
    expect(failures[0].message).toBe('String mismatch with diff')
  })

  it('未注册模板：对象 / 数组 / 正则 / 算子全部可用', async () => {
    setStringTemplate(null)
    expect((await validate({ a: 'x' }, { a: 'x' }, new ValidationContext())).pass).toBe(true)
    expect((await validate([1, 2], [1, 2], new ValidationContext())).pass).toBe(true)
    expect((await validate('abc', /^a/, new ValidationContext())).pass).toBe(true)
    expect((await validate(['a', 'b'], { $contains: 'a' }, new ValidationContext())).pass).toBe(true)
    expect((await validate(7, { $and: [{ $gt: 5 }, { $lt: 10 }] }, new ValidationContext())).pass).toBe(true)
  })

  it('未注册模板：{{...}} 按字面量参与匹配，不做插值', async () => {
    setStringTemplate(null)
    const { pass } = await validate('{{name}}', '{{name}}', new ValidationContext({ data: { name: 'Alice' } }))
    expect(pass).toBe(true)

    // 字面量与插值结果不同 -> 不匹配（证明没有偷偷插值）
    const res = await validate('Alice', '{{name}}', new ValidationContext({ data: { name: 'Alice' } }))
    expect(res.pass).toBe(false)
  })

  it('未注册模板：formatTemplate / formatObject 原样返回', async () => {
    setStringTemplate(null)
    expect(await formatTemplate('hi {{name}}', { data: { name: 'Bob' } })).toBe('hi {{name}}')
    expect(await formatObject({ '{{k}}': 'v' }, { data: { k: 'key' } })).toEqual({ '{{k}}': 'v' })
    expect(await formatTemplate(/{{name}}/, { data: { name: 'Bob' } })).toEqual(/{{name}}/)
  })

  it('注册模板后插值恢复正常', async () => {
    const { pass } = await validate('Alice', '{{name}}', new ValidationContext({ data: { name: 'Alice' } }))
    expect(pass).toBe(true)
  })

  it('getStringTemplate() 在未注册时仍然抛错（显式契约）', () => {
    setStringTemplate(null)
    expect(() => getStringTemplate()).toThrow(/@isdk\/match-ex-template/)
  })
})

describe('plugin registry / 纯文本快速路径', () => {
  it('isPlainValue 识别不含占位符特征的文本', () => {
    expect(isPlainValue('hello world')).toBe(true)
    expect(isPlainValue('a < b')).toBe(false) // erb/ejs 语法：保守起见不跳过
    expect(isPlainValue('{{name}}')).toBe(false)
    expect(isPlainValue('{name}')).toBe(false)
    expect(isPlainValue('$VAR')).toBe(false)
    expect(isPlainValue('${VAR}')).toBe(false)
  })

  it('没有占位符时不调用模板引擎', async () => {
    const seen: string[] = []
    setStringTemplate({
      formatIf: (o: any) => {
        seen.push(o.template)
        return o.template
      },
    })

    await formatTemplate('hello world', { data: { a: 1 } })
    expect(seen).toEqual([])

    await formatTemplate('hi {{a}}', { data: { a: 1 } })
    expect(seen).toEqual(['hi {{a}}'])

    // 可通过 skipPlainValue: false 强制走引擎
    await formatTemplate('hello world', { data: { a: 1 }, skipPlainValue: false })
    expect(seen).toEqual(['hi {{a}}', 'hello world'])
  })
})

describe('plugin registry / 未注册 schema 实现时回退对象匹配', () => {
  it('启发式 schema 期望值降级为普通对象匹配（不抛错）', async () => {
    setJsonSchemaType(null)
    const { pass, failures } = await validate('abc', { type: 'string' }, new ValidationContext())
    expect(pass).toBe(false)
    expect(failures[0].message).toBe('Value equality check failed')
  })

  it('启发式 schema 期望值仍能匹配相等的对象', async () => {
    setJsonSchemaType(null)
    const { pass } = await validate({ type: 'string' }, { type: 'string' }, new ValidationContext())
    expect(pass).toBe(true)
  })

  it('显式 $schema 算子在缺少实现时抛错提示安装插件', async () => {
    setJsonSchemaType(null)
    await expect(
      validate('abc', { $schema: { type: 'string' } }, new ValidationContext())
    ).rejects.toThrow(/@isdk\/match-ex-schema/)
  })

  it('自带的 JsonSchemaType 子类实例不依赖注册表即可工作', async () => {
    setJsonSchemaType(null)
    class AlwaysOk extends JsonSchemaType {
      validate(): boolean { return true }
      getErrors() { return null }
    }
    const { pass, failures } = await validate('abc', new AlwaysOk({ type: 'string' }), new ValidationContext())
    expect(pass).toBe(true)
    expect(failures).toHaveLength(0)
  })

  it('注册 schema 实现后启发式 schema 生效', async () => {
    expect((await validate('abc', { type: 'string' }, new ValidationContext())).pass).toBe(true)
    expect((await validate(123, { type: 'string' }, new ValidationContext())).pass).toBe(false)
  })
})

describe('plugin registry / 跨模块副本共享', () => {
  it('重复的模块实例（src vs dist）看到同一份注册表', async () => {
    const spy = { formatIf: (o: any) => `spy:${o.template}` }
    setStringTemplate(spy)
    setJsonSchemaType(originalSchemaCtor)

    vi.resetModules()
    const fresh = await import('../src/index.js')
    expect(fresh.getStringTemplate()).toBe(spy)
    expect(fresh.getJsonSchemaType()).toBe(originalSchemaCtor)
  })

  it('注册表挂在 globalThis 的 well-known symbol 上', () => {
    expect((globalThis as any)[REGISTRY_KEY]).toBeDefined()
    expect((globalThis as any)[REGISTRY_KEY].stringTemplate).toBe(originalTemplate)
  })
})
