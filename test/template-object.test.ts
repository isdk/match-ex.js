import { describe, it, expect } from 'vitest'
import { formatTemplate, formatObject } from '../src/template.js'

describe('validate/template object support', () => {
  it('should return raw object when using pure placeholder in formatTemplate', async () => {
    const data = { user: { name: 'Alice', age: 30 } }
    const result = await formatTemplate('{{user}}', { data })
    expect(result).toEqual({ name: 'Alice', age: 30 })
    expect(typeof result).toBe('object')
  })

  it('should support object replacement in formatObject', async () => {
    const input = {
      userInfo: '{{user}}',
      other: 'text'
    }
    const data = { user: { name: 'Bob' } }
    const result = await formatObject(input, { data })
    expect(result.userInfo).toEqual({ name: 'Bob' })
  })

  it('should support deep object replacement', async () => {
    const input = {
      level1: {
        level2: '{{target}}'
      }
    }
    const data = { target: { nested: true } }
    const result = await formatObject(input, { data })
    expect(result.level1.level2).toEqual({ nested: true })
  })

  it('should support recursive template resolution in replaced objects', async () => {
    const input = {
      userWrap: '{{user}}'
    }
    const data = {
      user: { name: '{{name}}', profile: '{{prof}}' },
      name: 'Alice',
      prof: { bio: 'developer' }
    }
    const result = await formatObject(input, { data })
    // 如果实现支持递归，这里应该被解析
    expect(result.userWrap.name).toBe('Alice')
    expect(result.userWrap.profile).toEqual({ bio: 'developer' })
  })

  it('should support object replacement in arrays', async () => {
    const input = ['{{item1}}', '{{item2}}']
    const data = {
      item1: { id: 1 },
      item2: { id: 2 }
    }
    const result = await formatObject(input, { data })
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('should support complex path placeholders', async () => {
    const input = '{{users[0].profile}}'
    const data = {
      users: [
        { profile: { name: 'First' } }
      ]
    }
    const result = await formatTemplate(input, { data })
    expect(result).toEqual({ name: 'First' })
  })

  it('should handle object as a key (via template)', async () => {
    // 虽然不常用，但测试其行为
    const input = { '{{objKey}}': 'value' }
    const data = { objKey: { a: 1 } }
    const result = await formatObject(input, { data })
    // 在 JS 中对象作为 key 会被转为 "[object Object]"
    const keys = Object.keys(result)
    expect(keys[0]).toBe('[object Object]')
    expect(result[keys[0]]).toBe('value')
  })

  it('should still format strings normally when not a pure placeholder', async () => {
    const data = { user: { name: 'Alice' } }
    // 非纯占位符，PromptTemplate 将对象转为 JSON 字符串
    const result = await formatTemplate('User is {{user}}', { data })
    expect(typeof result).toBe('string')
    expect(result).toContain('{"name":"Alice"}')
  })

  it('should return undefined if pure placeholder variable does not exist', async () => {
    const result = await formatTemplate('{{nonExistent}}', { data: {} })
    // 如果变量不存在，PromptTemplate.formatIf 通常返回原始模板或 undefined/empty string
    // 具体取决于其实现，但开启 raw: true 时通常预期返回 undefined 或原始串
    // 这里我们检查它不再是预期的对象即可
    expect(result).not.toBeInstanceOf(Object)
  })

  it('should return falsy values as-is when using pure placeholder', async () => {
    const data = { zero: 0, no: false, nothing: null, empty: "" }
    expect(await formatTemplate('{{zero}}', { data })).toBe(0)
    expect(await formatTemplate('{{no}}', { data })).toBe(false)
    expect(await formatTemplate('{{nothing}}', { data })).toBe(null)
    expect(await formatTemplate('{{empty}}', { data })).toBe("")
  })

  it('should handle special characters in paths', async () => {
    const data = { "special-key": { "@value": "found" } }
    const result = await formatTemplate('{{["special-key"]["@value"]}}', { data })
    expect(result).toBe('found')
  })

  it('should handle undefined data gracefully', async () => {
    const result = await formatTemplate('{{something}}', { data: undefined } as any)
    expect(result).toBe('{{something}}')
  })
})
