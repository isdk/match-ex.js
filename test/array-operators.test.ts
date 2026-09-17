import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'

describe('Array Processing Operators', () => {
  describe('$sort', () => {
    it('should sort an array of objects by a single string field (asc and desc)', async () => {
      const actual = [
        { id: 2, name: 'Bob' },
        { id: 1, name: 'Alice' },
        { id: 3, name: 'Charlie' }
      ]

      // Ascending
      const rs1 = await validate(actual, {
        $sort: {
          $by: 'id',
          $first: { name: 'Alice' }
        }
      }, new ValidationContext({ scoring: true }))
      expect(rs1.pass).toBe(true)

      // Descending
      const rs2 = await validate(actual, {
        $sort: {
          $by: '-id',
          $first: { name: 'Charlie' }
        }
      }, new ValidationContext({ scoring: true }))
      expect(rs2.pass).toBe(true)
    })

    it('should sort an array of objects by multiple fields', async () => {
      const actual = [
        { score: 90, age: 20 },
        { score: 90, age: 25 },
        { score: 80, age: 22 }
      ]

      const rs = await validate(actual, {
        $sort: {
          $by: ['-score', 'age'], // score desc, then age asc
          $first: { age: 20 },
          $last: { score: 80 }
        }
      }, new ValidationContext({ scoring: true }))

      expect(rs.pass).toBe(true)
    })

    it('should sort using a synchronous function', async () => {
      const actual = [{ v: 3 }, { v: 1 }, { v: 2 }]
      const rs = await validate(actual, {
        $sort: {
          $by: (item: any) => item.v,
          $sequence: [{ v: 1 }, { v: 2 }, { v: 3 }]
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should sort using an asynchronous function', async () => {
      const actual = [{ v: 3 }, { v: 1 }, { v: 2 }]
      const rs = await validate(actual, {
        $sort: {
          $by: async (item: any) => {
            await new Promise(resolve => setTimeout(resolve, 10))
            return item.v
          },
          $sequence: [{ v: 1 }, { v: 2 }, { v: 3 }]
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should sort using expression objects with custom order', async () => {
      const actual = [{ a: 1, b: 2 }, { a: 2, b: 1 }, { a: 1, b: 1 }]
      // Sort by a (asc), then by b (desc)
      const rs = await validate(actual, {
        $sort: {
          $by: [
            'a',
            { $expr: 'item.b', order: 'desc' }
          ],
          $sequence: [
            { a: 1, b: 2 },
            { a: 1, b: 1 },
            { a: 2, b: 1 }
          ]
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should provide access to index and array in expression', async () => {
      const actual = ['c', 'a', 'b']
      // Sort by index in reverse order (just for testing access)
      const rs = await validate(actual, {
        $sort: {
          $by: { $expr: 'index', order: 'desc' },
          $sequence: ['b', 'a', 'c']
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should handle complex expressions and context', async () => {
      const actual = [{ val: 10 }, { val: 20 }, { val: 30 }]
      const rs = await validate(actual, {
        $sort: {
          $by: { $expr: 'item.val + data.offset', order: 'desc' },
          $first: { val: 30 }
        }
      }, new ValidationContext({ data: { offset: 100 } }))
      expect(rs.pass).toBe(true)
    })

    it('should be a stable sort (preserve order for equal keys)', async () => {
      const actual = [
        { category: 'A', id: 1 },
        { category: 'B', id: 2 },
        { category: 'A', id: 3 },
        { category: 'B', id: 4 }
      ]
      // Sort only by category
      const rs = await validate(actual, {
        $sort: {
          $by: 'category',
          $sequence: [
            { category: 'A', id: 1 },
            { category: 'A', id: 3 },
            { category: 'B', id: 2 },
            { category: 'B', id: 4 }
          ]
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should support mixed types in $by array', async () => {
      const actual = [
        { type: 'fruit', price: 10, name: 'apple' },
        { type: 'veg', price: 5, name: 'carrot' },
        { type: 'fruit', price: 5, name: 'banana' }
      ]
      // 1. type (string desc) -> 'veg', 'fruit', 'fruit'
      // 2. price (function asc) -> 5, 5, 10
      // 3. name (expr asc)
      const rs = await validate(actual, {
        $sort: {
          $by: [
            '-type',
            (item: any) => item.price,
            { $expr: 'item.name' }
          ],
          $sequence: [
            { name: 'carrot' },
            { name: 'banana' },
            { name: 'apple' }
          ]
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should handle missing properties gracefully', async () => {
      const actual = [{ a: 2 }, { }, { a: 1 }]
      const rs = await validate(actual, {
        $sort: {
          $by: 'a',
          // lodash handles undefined/null by putting them at the end or beginning depending on order
          $first: { a: 1 },
          $last: { }
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should handle expressions accessing nested properties', async () => {
      const actual = [
        { user: { profile: { age: 30 } } },
        { user: { profile: { age: 20 } } },
        { user: { profile: { age: 25 } } }
      ]
      const rs = await validate(actual, {
        $sort: {
          $by: { $expr: 'item.user.profile.age' },
          $first: { user: { profile: { age: 20 } } }
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should handle errors in expression evaluation gracefully', async () => {
      const actual = [{ a: 1 }, { a: 2 }]
      // This will throw because 'undefinedVariable' is not defined
      const rs = await validate(actual, {
        $sort: {
          $by: { $expr: 'undefinedVariable.prop' },
          $sequence: [{ a: 1 }, { a: 2 }]
        }
      }, new ValidationContext())

      expect(rs.pass).toBe(false)
      expect(rs.failures[0].message).toContain('evaluation error')
    })

    it('should sort an array of primitive strings using $expr', async () => {
      const actual = ['banana', 'apple', 'cherry']
      const rs = await validate(actual, {
        $sort: {
          $by: { $expr: 'item' }, // sort alphabetically
          $sequence: ['apple', 'banana', 'cherry']
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should handle complex logic in async function', async () => {
      const actual = [{ v: 'a' }, { v: 'b' }, { v: 'c' }]
      const rs = await validate(actual, {
        $sort: {
          $by: async (item: any, index: number, array: any[]) => {
            // Complex logic: reverse sort based on some async "weight"
            return array.length - index
          },
          $sequence: [{ v: 'c' }, { v: 'b' }, { v: 'a' }]
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })

    it('should fall back to natural sort if $by is empty array, and fail if $by is invalid type', async () => {
      const actual = [3, 1, 2]

      const rs1 = await validate(actual, {
        $sort: {
          $by: [],
          $sequence: [1, 2, 3]
        }
      }, new ValidationContext())
      expect(rs1.pass).toBe(true)

      const rs2 = await validate(actual, {
        $sort: {
          $by: 123, // invalid
          $sequence: [1, 2, 3]
        }
      }, new ValidationContext())
      expect(rs2.pass).toBe(false)
      expect(rs2.failures[0].message).toContain('must be a string, function, or expression object')
    })

    it('should chain nicely with $each', async () => {
      const actual = [
        { val: 1 },
        { val: 2 },
        { val: 3 }
      ]
      const rs = await validate(actual, {
        $sort: {
          $by: '-val',
          $each: {
            val: { $gt: 0 }
          }
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)
    })
  })

  describe('$nth / $first / $last', () => {
    const actual = [
      { id: 1, type: 'A' },
      { id: 2, type: 'B' },
      { id: 3, type: 'C' }
    ]

    it('should extract correct element with $nth', async () => {
      const rs = await validate(actual, {
        $nth: {
          $index: 1,
          type: 'B'
        }
      }, new ValidationContext({ scoring: true }))
      expect(rs.pass).toBe(true)
    })

    it('should handle negative index in $nth', async () => {
      const rs = await validate(actual, {
        $nth: {
          $index: -2,
          type: 'B'
        }
      }, new ValidationContext({ scoring: true }))
      expect(rs.pass).toBe(true)
    })

    it('should return fail if index is out of bounds for $nth', async () => {
      const rs = await validate(actual, {
        $nth: {
          $index: 5,
          type: 'A'
        }
      }, new ValidationContext({ scoring: true }))
      expect(rs.pass).toBe(false)
      expect(rs.failures[0].message).toContain('is out of bounds for array of length 3')
    })

    it('should default to first element if $index is omitted in $nth', async () => {
      const rs = await validate(actual, {
        $nth: {
          type: 'A'
        }
      }, new ValidationContext())
      expect(rs.pass).toBe(true)

      const rs2 = await validate(actual, {
        $nth: {
          type: 'B' // wrong
        }
      }, new ValidationContext())
      expect(rs2.pass).toBe(false)
    })

    it('should work correctly with $first alias', async () => {
      const rs = await validate(actual, {
        $first: {
          type: 'A'
        }
      }, new ValidationContext({ scoring: true }))
      expect(rs.pass).toBe(true)
    })

    it('should work correctly with $last alias', async () => {
      const rs = await validate(actual, {
        $last: {
          type: 'C'
        }
      }, new ValidationContext({ scoring: true }))
      expect(rs.pass).toBe(true)
    })

    it('should report failure with meaningful path', async () => {
      const rs = await validate({ items: actual }, {
        items: {
          $last: {
            type: 'Z' // will fail
          }
        }
      }, new ValidationContext({ key: 'root' }))

      expect(rs.pass).toBe(false)
      // Path tracing check:
      // The path should look like 'root.items[2].type'
      expect(rs.failures[0].key).toBe('root.items[2].type')
    })
  })

  describe('Integration (Chaining Modifiers)', () => {
    it('should compose $sort and $first smoothly', async () => {
      const actual = [
        { date: '2023-01-01', v: 10 },
        { date: '2023-01-03', v: 30 },
        { date: '2023-01-02', v: 20 }
      ]

      const rs = await validate(actual, {
        $sort: {
          $by: '-date',
          $first: { v: 30 },
          $last: { v: 10 }
        }
      }, new ValidationContext())

      expect(rs.pass).toBe(true)
    })
  })
})
