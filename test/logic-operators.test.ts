import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'

describe('validate/logic-operators', () => {
  describe('$and', () => {
    it('should pass if all conditions are met', async () => {
      const actual = 15
      const expected = {
        $and: [
          { $schema: { type: 'number', minimum: 10 } },
          { $schema: { type: 'number', maximum: 20 } }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should fail if any condition is not met', async () => {
      const actual = 25
      const expected = {
        $and: [
          { $schema: { type: 'number', minimum: 10 } },
          { $schema: { type: 'number', maximum: 20 } }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(1)
      expect(failures[0].key).toBe('$and[1]')
    })

    it('should collect multiple failures if multiple conditions are not met', async () => {
      const actual = 5
      const expected = {
        $and: [
          { $schema: { type: 'number', minimum: 10 } },
          { $schema: { type: 'number', minimum: 15 } }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(2)
      expect(failures[0].key).toBe('$and[0]')
      expect(failures[1].key).toBe('$and[1]')
    })

    it('should work on objects', async () => {
      const actual = { name: 'test', age: 20 }
      const expected = {
        $and: [
          { name: 'test' },
          { age: 20 }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should support template variables inside $and', async () => {
      const actual = 'hello world'
      const data = { prefix: 'hello' }
      const expected = {
        $and: [
          '{{prefix}} world',
          { $schema: { type: 'string', minLength: 5 } }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext({ data }))
      expect(failures).toHaveLength(0)
    })

    it('should handle empty $and array as always passing', async () => {
      const actual = { any: 'value' }
      const expected = { $and: [] }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })
  })

  describe('$or', () => {
    it('should pass if at least one condition is met', async () => {
      const actual = 'success'
      const expected = {
        $or: ['success', 'pending']
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should fail and show summary if all conditions are not met', async () => {
      const actual = 'failed'
      const expected = {
        $or: ['success', 'pending']
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('$or mismatch: none of the conditions met')
      // Branch details are part of the aggregated failure messages in new implementation
      expect(failures[0].message).toContain('Branch 0')
      expect(failures[0].message).toContain('Branch 1')
    })

    it('should support template variables inside $or', async () => {
      const actual = 'admin'
      const data = { role: 'admin' }
      const expected = {
        $or: ['guest', '{{role}}']
      }
      const { failures } = await validate(actual, expected, new ValidationContext({ data }))
      expect(failures).toHaveLength(0)
    })

    it('should work with complex nested conditions', async () => {
      const actual = { status: 'error', code: 500 }
      const expected = {
        $or: [
          { status: 'success' },
          { $and: [{ status: 'error' }, { code: 500 }] }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should fail if $or array is empty', async () => {
      const actual = 'any'
      const expected = { $or: [] }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('none of the conditions met')
    })
  })

  describe('Complex Combinations & Strict Mode', () => {
    it('should handle $not inside $and', async () => {
      const actual = 'user_123'
      const expected = {
        $and: [
          { $schema: { type: 'string', pattern: '^user_' } },
          { $not: 'user_admin' }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should respect strict mode for objects within logic operators', async () => {
      const actual = { name: 'test', extra: 'key' }
      const expected = {
        $or: [
          { name: 'other' },
          { name: 'test' }
        ]
      }
      // In non-strict mode (default), this should pass even with 'extra' key
      let { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)

      // In strict mode, it should fail if the matching branch has missing keys in expectation
      const result = await validate(actual, expected, new ValidationContext({ strict: true }))
      failures = result.failures
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('Extra key')
    })

    it('should track deep keys accurately in failures', async () => {
      const actual = { user: { id: 1 } }
      const expected = {
        user: {
          $and: [
            { id: { $schema: { type: 'number', minimum: 5 } } }
          ]
        }
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(1)
      // Path should accurately reflect the traversal: user -> $and[0] -> id
      expect(failures[0].key).toBe('user.id')
    })

    it('should track deep muliti keys accurately in failures', async () => {
      const actual = { user: { id: 1, sex: 'none' } }
      const expected = {
        user: {
          $and: [
            { id: { $schema: { type: 'number', minimum: 5 } } },
            { sex: { $schema: { type: 'stirng', enum: ['male', 'female'] } } },
          ]
        }
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(1)
      // Path should accurately reflect the traversal: user -> $and[0] -> id
      expect(failures[0].key).toBe('user.$and[0].id')
    })

    it('should handle triple-level nesting: $or -> $and -> $or', async () => {
      const actual = { val: 10 }
      const expected = {
        val: {
          $or: [
            { $and: [
                { $or: [5, 10] },
                { $schema: { type: 'number', minimum: 10 } }
            ]},
            20
          ]
        }
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should mix collection operators with logic: $all containing $or', async () => {
      const actual = ['apple', 'banana']
      const expected = {
        $all: [
          { $or: ['apple', 'orange'] },
          { $or: ['banana', 'cherry'] }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should mix regex with logic operators', async () => {
      const actual = 'test-123'
      const expected = {
        $and: [
          /^test-/,
          { $schema: { type: 'string', minLength: 5 } }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should provide deep summary when nested $or fails inside $and', async () => {
      const actual = 5
      const expected = {
        $and: [
          { $or: [1, 2] },
          { $or: [3, 4] }
        ]
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(2)
      expect(failures[0].key).toBe('$and[0]')
      expect(failures[0].message).toContain('$or mismatch')
      expect(failures[1].key).toBe('$and[1]')
      expect(failures[1].message).toContain('$or mismatch')
    })
  })

  describe('Edge Cases & Special Types', () => {
    it('should fail if expected is not an array', async () => {
      const { failures } = await validate(10, { $and: 'not an array' as any }, new ValidationContext())
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toBe('$and operator requires an array of expectations')

      const { failures: failuresOr } = await validate(10, { $or: 'not an array' as any }, new ValidationContext())
      expect(failuresOr).toHaveLength(1)
      expect(failuresOr[0].message).toBe('$or operator requires an array of expectations')
    })

    it('should work with custom function matchers', async () => {
      const isEven = (val: any) => val % 2 === 0 ? true : 'must be even'
      const isPositive = (val: any) => val > 0 ? true : 'must be positive'

      const { failures } = await validate(4, { $and: [isEven, isPositive] }, new ValidationContext())
      expect(failures).toHaveLength(0)

      const { failures: failures2 } = await validate(-2, { $and: [isEven, isPositive] }, new ValidationContext())
      expect(failures2).toHaveLength(1)
      expect(failures2[0].message).toContain('must be positive')
    })

    it('should handle null and undefined actual values', async () => {
      const { failures } = await validate(null, {
        $or: [null, 'something']
      }, new ValidationContext())
      expect(failures).toHaveLength(0)

      const { failures: failures2 } = await validate(undefined, {
        $and: [{ $schema: { type: 'undefined' } }]
      }, new ValidationContext())
      // Note: json-schema might not support 'undefined' type directly,
      // but let's test if our logic operator survives the call.
      expect(failures2).toBeDefined()
    })

    it('should work as a top-level operator', async () => {
      const { failures } = await validate('test', { $and: [/t/, /e/, /s/, /t/] }, new ValidationContext())
      expect(failures).toHaveLength(0)
    })
  })
})
