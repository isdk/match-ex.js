import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'

describe('Object Metadata Breaking Change - Comprehensive Matrix', () => {
  describe('Exclusivity & Collision (The Core Logic)', () => {
    it('Status A: No $meta - should treat $score as weight and NOT validate it as data', async () => {
      const actual = { val: 10 }
      const expected = {
        val: 10,
        $score: 50 // Extracted as metadata
      }
      const ctx = new ValidationContext({ scoring: true })
      const result = await validate(actual, expected, ctx)
      
      expect(result.pass).toBe(true)
      expect(result.details?.[0].weight).toBeCloseTo(1.0) // Only one item, so normalized weight is 1.0
      // Ensure $score was not looked for in actual
    })

    it('Status B: $meta exists - should treat top-level $score as BUSINESS DATA', async () => {
      const actual = {
        val: 10,
        $score: 50 // Business data in actual
      }
      const expected = {
        val: 10,
        $meta: { score: 100 }, // Real metadata
        $score: 50             // Should be validated as business data
      }
      const ctx = new ValidationContext({ scoring: true })
      const result = await validate(actual, expected, ctx)
      
      expect(result.pass).toBe(true)
      // If $score was treated as meta, this would still pass, but let's test a mismatch
      const expectedMismatch = {
        ...expected,
        $score: 60 // Should fail because actual.$score is 50
      }
      const resultFail = await validate(actual, expectedMismatch, ctx)
      expect(resultFail.pass).toBe(false)
      expect(resultFail.failures.some(f => f.key === '$score')).toBe(true)
    })

    it('Status C: Empty $meta - should still disable top-level shorthands', async () => {
      const actual = { $score: 50 }
      const expected = {
        $meta: {},
        $score: 50 // Validated as data because $meta exists
      }
      const result = await validate(actual, expected, new ValidationContext())
      expect(result.pass).toBe(true)
    })
  })

  describe('Metadata Extraction (All Shorthands)', () => {
    const shorthands = [
      { key: '$score', val: 80, check: (res: any) => res.details[0].weight }, // Note: weight is normalized
      { key: '$title', val: 'My Title', check: (res: any) => res.details[0].title === 'My Title' },
      { key: '$dimension', val: 'security', check: (res: any) => res.details[0].dimension === 'security' },
      { key: '$critical', val: true, check: (res: any) => res.details[0].critical === true },
    ]

    shorthands.forEach(({ key, val, check }) => {
      it(`should correctly extract ${key}`, async () => {
        const expected = {
          item: 'val',
          [key]: val
        }
        const result = await validate({ item: 'val' }, expected, new ValidationContext({ scoring: true }))
        expect(result.pass).toBe(true)
        expect(check(result)).toBeTruthy()
      })
    })

    it('should extract complex $meta structure', async () => {
       const expected = {
         item: 'val',
         $meta: {
           score: { value: 20, critical: true, title: 'Deep Meta' }
         }
       }
       const result = await validate({ item: 'val' }, expected, new ValidationContext({ scoring: true }))
       expect(result.details?.[0].critical).toBe(true)
       expect(result.details?.[0].title).toBe('Deep Meta')
    })
  })

  describe('Collision & Legacy Matrix', () => {
    it('should validate non-prefixed "score" and "title" as normal data', async () => {
      const actual = { score: 100, title: 'foo' }
      const expected = { score: 200, title: 'foo' } // score mismatch
      const result = await validate(actual, expected, new ValidationContext())
      expect(result.pass).toBe(false)
      expect(result.failures[0].key).toBe('score')
    })

    it('should NOT filter unknown $ keys (treat as business data)', async () => {
      const actual = { $unknown: 'bar' }
      const expected = { $unknown: 'baz' } // mismatch
      const result = await validate(actual, expected, new ValidationContext())
      expect(result.pass).toBe(false)
      expect(result.failures[0].key).toBe('$unknown')
    })
  })

  describe('Coexistence Matrix (Operators + Meta)', () => {
    it('should support Operator + $meta', async () => {
      const actual = ['apple', 'banana']
      const expected = {
        $meta: { title: 'Fruits Test' },
        $contains: 'apple'
      }
      const result = await validate(actual, expected, new ValidationContext())
      expect(result.pass).toBe(true)
      expect(result.title).toBe('Fruits Test')
    })

    it('should support Operator + Shorthand', async () => {
      const actual = ['apple', 'banana']
      const expected = {
        $title: 'Shorthand Test',
        $contains: 'apple'
      }
      const result = await validate(actual, expected, new ValidationContext())
      expect(result.pass).toBe(true)
      expect(result.title).toBe('Shorthand Test')
    })
  })

  describe('Structural Matrix', () => {
    it('should NOT trigger "extra key" errors in strict mode for $meta or shorthands', async () => {
      const actual = { a: 1 }
      const expected = {
        a: 1,
        $meta: { title: 'No extra' },
        $score: 100 // No $meta, so this is meta
      }
      // Note: Here $score is meta because we didn't provide $meta at top level.
      // Let's test both cases.
      
      // Case 1: Shorthands as meta
      const result1 = await validate(actual, { a: 1, $score: 100 }, new ValidationContext({ strict: 'object' }))
      expect(result1.pass).toBe(true)

      // Case 2: $meta as meta
      const result2 = await validate(actual, { a: 1, $meta: { score: 100 } }, new ValidationContext({ strict: 'object' }))
      expect(result2.pass).toBe(true)
    })

    it('should apply rules recursively in deep objects', async () => {
      const actual = {
        nested: { score: 100 }
      }
      const expected = {
        nested: {
          score: 100, // Business data
          $title: 'Nested Meta' // Meta
        }
      }
      const result = await validate(actual, expected, new ValidationContext())
      expect(result.pass).toBe(true)
      expect(result.details?.[0].details?.[0].title).toBe('Nested Meta')
    })
  })
})
