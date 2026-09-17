import { describe, it, expect } from 'vitest'
import { formatTemplate, formatObject } from '../src/template.js'

describe('validate/template', () => {
  describe('formatTemplate', () => {
    it('should format string template with data', async () => {
      const result = await formatTemplate('hello {{name}}', { data: { name: 'world' } })
      expect(result).toBe('hello world')
    })

    it('should format string template with merged input data', async () => {
      const result = await formatTemplate('{{greeting}} {{name}}', {
        data: { greeting: 'Hi' },
        input: { name: 'Alice' }
      })
      expect(result).toBe('Hi Alice')
    })

    it('should format RegExp template', async () => {
      const result = await formatTemplate(/{{name}}/, { data: { name: 'world' } })
      expect(result).toBeInstanceOf(RegExp)
      expect((result as RegExp).source).toBe('world')
    })

    it('should return original if no data provided', async () => {
      const result = await formatTemplate('hello {{name}}', {})
      expect(result).toBe('hello {{name}}')
    })

    it('should return original if not a string or RegExp', async () => {
      const result = await formatTemplate(123, { data: { name: 'world' } })
      expect(result).toBe(123)
    })

    it('should preserve RegExp flags when formatting', async () => {
      const result = await formatTemplate(/{{name}}/i, { data: { name: 'world' } })
      expect(result).toBeInstanceOf(RegExp)
      expect((result as RegExp).source).toBe('world')
      expect((result as RegExp).flags).toBe('i')
    })

    it('should support templateFormat option', async () => {
      const result = await formatTemplate('hello ${name}', {
        data: { name: 'world' },
        templateFormat: 'js'
      })
      expect(result).toBe('hello world')
    })
  })

  describe('formatObject', () => {
    it('should format object values and keys', async () => {
      const input = {
        '{{keyName}}': '{{value}}',
        'nested': {
          'foo': '{{bar}}'
        }
      }
      const options = { data: { keyName: 'realKey', value: 'realValue', bar: 'baz' } }
      const result = await formatObject(input, options)
      expect(result).toEqual({
        realKey: 'realValue',
        nested: {
          foo: 'baz'
        }
      })
    })

    it('should format array elements', async () => {
      const input = ['{{a}}', '{{b}}']
      const options = { data: { a: '1', b: '2' } }
      const result = await formatObject(input, options)
      expect(result).toEqual(['1', '2'])
    })

    it('should handle RegExp in object', async () => {
      const input = { reg: /{{pattern}}/ }
      const options = { data: { pattern: 'abc' } }
      const result = await formatObject(input, options)
      expect(result.reg).toBeInstanceOf(RegExp)
      expect(result.reg.source).toBe('abc')
    })

    it('should format deeply nested structures', async () => {
      const input = {
        a: [{ b: '{{val}}' }],
        c: { d: { e: '{{val}}' } }
      }
      const result = await formatObject(input, { data: { val: 'foo' } })
      expect(result.a[0].b).toBe('foo')
      expect(result.c.d.e).toBe('foo')
    })
  })
})
