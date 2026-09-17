import { describe, it, expect } from 'vitest'
import { validateMatch } from '../src/core.js'

describe('validate/core', () => {
  it('should pass on simple string equality', async () => {
    const failures = await validateMatch('hello', 'hello')
    expect(failures).toHaveLength(0)
  })

  it('should trim actual string before comparison', async () => {
    const failures = await validateMatch('  hello  ', 'hello')
    expect(failures).toHaveLength(0)
  })

  it('should fail on string mismatch', async () => {
    const failures = await validateMatch('hello', 'world')
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toBe('String mismatch with diff')
  })

  it('should pass on RegExp match', async () => {
    const failures = await validateMatch('hello world', /hello/)
    expect(failures).toHaveLength(0)
  })

  it('should fail on RegExp mismatch', async () => {
    const failures = await validateMatch('hello world', /foo/)
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toContain('RegExp mismatch: expected /foo/')
    expect(failures[0].expected).toBe('/foo/')
  })

  it('should fail on RegExp mismatch with flags', async () => {
    const failures = await validateMatch('hello world', /foo/i)
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toContain('RegExp mismatch: expected /foo/i')
    expect(failures[0].expected).toBe('/foo/i')
  })

  it('should support templates in expected string', async () => {
    const failures = await validateMatch('hello Alice', 'hello {{name}}', { data: { name: 'Alice' } })
    expect(failures).toHaveLength(0)
  })

  it('should support templates in expected RegExp', async () => {
    const failures = await validateMatch('hello Alice', /{{name}}/, { data: { name: 'Alice' } })
    expect(failures).toHaveLength(0)
  })

  describe('array validation', () => {
    it('should pass on matching arrays', async () => {
      const failures = await validateMatch([1, 2], [1, 2])
      expect(failures).toHaveLength(0)
    })

    it('should fail on type mismatch', async () => {
      const failures = await validateMatch('not an array', [1, 2])
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toBe('Type mismatch: expected Array')
    })

    it('should fail on length mismatch in strict mode', async () => {
      const failures = await validateMatch([1, 2, 3], [1, 2], { strict: 'array' })
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('Array length mismatch')
    })

    it('should report failures at correct index', async () => {
      const failures = await validateMatch([1, 3], [1, 2])
      expect(failures).toHaveLength(1)
      expect(failures[0].key).toBe('[1]')
    })
  })

  describe('object validation', () => {
    it('should pass on matching objects', async () => {
      const failures = await validateMatch({ a: 1, b: 2 }, { a: 1, b: 2 })
      expect(failures).toHaveLength(0)
    })

    it('should pass on null', async () => {
      const failures = await validateMatch(null, null)
      expect(failures).toHaveLength(0)
    })

    it('should fail if actual is not null when expected is null', async () => {
      const failures = await validateMatch({}, null)
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toBe('Value equality check failed')
    })

    it('should support RegExp keys in expected object', async () => {
      const failures = await validateMatch({ foo_123: 'bar' }, { '/foo_.*/': 'bar' })
      expect(failures).toHaveLength(0)
    })

    it('should fail in strict mode if extra keys exist', async () => {
      const failures = await validateMatch({ a: 1, b: 2 }, { a: 1 }, { strict: 'object' })
      expect(failures).toHaveLength(1)
      expect(failures[0].key).toBe('b')
      expect(failures[0].message).toBe('Extra key in actual object (strict mode)')
    })

    it('should support nested path keys', async () => {
      const actual = {
        user: {
          profile: {
            name: 'Alice',
            age: 30
          }
        }
      }
      const expected = {
        'user.profile.name': 'Alice',
        'user.profile.age': 30
      }
      const failures = await validateMatch(actual, expected)
      expect(failures).toHaveLength(0)

      const failures2 = await validateMatch(actual, { 'user.profile.name': 'Bob' })
      expect(failures2).toHaveLength(1)
      expect(failures2[0].key).toBe('user.profile.name')
    })

    it('should support $schema with nested path keys', async () => {
      const actual = {
        user: {
          settings: { theme: 'dark', fontSize: 14 }
        }
      }
      const expected = {
        'user.settings': {
          $schema: {
            type: 'object',
            required: ['theme'],
            properties: {
              fontSize: { type: 'number', minimum: 12 }
            }
          }
        }
      }
      const failures = await validateMatch(actual, expected)
      expect(failures).toHaveLength(0)
    })
  })

  describe('custom function', () => {
    it('should pass if function returns true', async () => {
      const failures = await validateMatch(10, (val: number) => val > 5)
      expect(failures).toHaveLength(0)
    })

    it('should fail if function returns false or error message', async () => {
      const failures = await validateMatch(10, (val: number) => val < 5 || 'too big')
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('too big')
    })

    it('should handle async custom functions', async () => {
      const asyncMatcher = async (val: any) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return val === 'ok' || 'not ok'
      }
      const failures = await validateMatch('ok', asyncMatcher)
      expect(failures).toHaveLength(0)

      const failures2 = await validateMatch('bad', asyncMatcher)
      expect(failures2).toHaveLength(1)
    })
  })

  describe('nested validation and path reporting', () => {
    it('should report deep path for failures', async () => {
      const actual = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' }
        ]
      }
      const expected = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Charlie' }
        ]
      }
      const failures = await validateMatch(actual, expected)
      expect(failures).toHaveLength(1)
      expect(failures[0].key).toBe('users[1].name')
    })

    it('should report all error paths correctly for multiple failures', async () => {
      const actual = {
        users: [
          { id: 1, name: 'Alice', age: 20 },
          { id: 2, name: 'Bob', age: 25 }
        ],
        meta: {
          version: '1.0',
          count: 2
        }
      }
      const expected = {
        users: [
          { id: 1, name: 'Alice', age: 21 },
          { id: 2, name: 'Charlie', age: 25 }
        ],
        meta: {
          version: '1.1',
          count: 2
        }
      }

      const failures = await validateMatch(actual, expected)
      expect(failures).toHaveLength(3)
      const keys = failures.map(f => f.key)
      expect(keys).toContain('users[0].age')
      expect(keys).toContain('users[1].name')
      expect(keys).toContain('meta.version')
    })
  })

  describe('isStrict array integration', () => {
    it('should respect multiple strict types', async () => {
      const options = { strict: ['object', 'array'] }

      // Should fail on extra key (object strict)
      const f1 = await validateMatch({ a: 1, b: 2 }, { a: 1 }, options)
      expect(f1).toHaveLength(1)

      // Should fail on length mismatch (array strict)
      const f2 = await validateMatch([1, 2], [1], options)
      expect(f2).toHaveLength(1)
    })
  })
})
