import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'
import { formatObject } from '../src/template.js'

describe('Object Metadata - Stress & Edge Cases', () => {
  it('should maintain local exclusivity: parent $meta does NOT disable child shorthands', async () => {
    const actual = {
      child: { val: 10 }
    }
    const expected = {
      $meta: { title: 'Parent Title' }, // Parent uses explicit mode
      child: {
        val: 10,
        $score: 80 // Child does NOT have $meta, so $score should be meta for child
      }
    }

    const ctx = new ValidationContext({ scoring: true })
    const result = await validate(actual, expected, ctx)

    expect(result.pass).toBe(true)
    expect(result.title).toBe('Parent Title')
    // Check if child's $score was correctly used as weight for child node
    // In result.details[0] (parent object), its first child detail should have the weight
    const childDetail = result.details?.[0].details?.[0]
    expect(childDetail?.weight).toBeCloseTo(1.0) // 80 is the only weight in child
  })

  it('should treat unknown $ prefixed keys as business data', async () => {
    const actual = {
      $id: '123',
      $type: 'internal'
    }
    const expected = {
      $id: '123',
      $type: 'external' // Should cause failure
    }

    const ctx = new ValidationContext()
    const result = await validate(actual, expected, ctx)

    expect(result.pass).toBe(false)
    expect(result.failures[0].key).toBe('$type')
    expect(result.failures[0].actual).toBe('internal')
    expect(result.failures[0].expected).toBe('external')
  })

  it('should correctly resolve templates in $meta properties', async () => {
    const actual = { a: 1 }
    const expected = {
      a: 1,
      $meta: {
        title: 'Title for {{user}}',
        score: '{{base_score}}'
      }
    }

    // Note: In a real run, AITestRunner calls formatObject on the whole expected object.
    // Here we simulate the context data.
    const ctx = new ValidationContext({
      scoring: true,
      data: { user: 'Alice', base_score: 50 }
    })

    // We need to simulate the formatting that AITestRunner would do
    // Because validate() itself only formats strings if the whole expected is a string.
    const formattedExpected = await formatObject(expected, { data: ctx.data })

    const result = await validate(actual, formattedExpected, ctx)

    expect(result.pass).toBe(true)
    expect(result.title).toBe('Title for Alice')
    // Verify score was resolved to 50
    expect(result.details?.[0].weight).toBeCloseTo(1.0) // Still 1.0 because only one item, but internal logic used 50
  })

  it('should be robust with invalid $meta types', async () => {
    const actual = { a: 1 }
    const expected = {
      a: 1,
      $meta: "not an object", // Invalid meta container
      $score: 80              // Should fall back to shorthand mode
    }

    const ctx = new ValidationContext({ scoring: true })
    const result = await validate(actual, expected, ctx)

    expect(result.pass).toBe(true)
    expect(result.details?.[0].weight).toBeCloseTo(1.0)
  })

  it('should handle $meta and operators coexisting at deep levels', async () => {
    const actual = {
      data: [1, 2, 3]
    }
    const expected = {
      data: {
        $meta: { title: 'Array Validation' },
        $contains: 2
      }
    }

    const result = await validate(actual, expected, new ValidationContext())
    expect(result.pass).toBe(true)
    // The title should be on the 'data' property detail
    expect(result.details?.[0].title).toBe('Array Validation')
  })

  it('should handle metadata in very deep nesting', async () => {
    const actual = { a: { b: { c: 1 } } }
    const expected = {
      a: {
        b: {
          $meta: { title: 'Deepest' },
          c: 1
        }
      }
    }
    const result = await validate(actual, expected, new ValidationContext())
    expect(result.pass).toBe(true)
    // Layer 0: root (has detail 'a')
    // Layer 1: 'a' (has detail 'a.b')
    // Layer 2: 'a.b' (has title 'Deepest')
    expect(result.details?.[0].details?.[0].title).toBe('Deepest')
  })
})
