import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'

describe('$contains extension', () => {
  it('should support string inclusion (substring)', async () => {
    const actual = 'Hello World'
    const expected = { $contains: 'World' }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('should fail if string does not contain substring', async () => {
    const actual = 'Hello World'
    const expected = { $contains: 'Universe' }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(1)
    // The message comes from validateString/processValidationResult
    expect(failures[0].message).toContain('String mismatch')
  })

  it('should support object subset match', async () => {
    const actual = { id: 1, name: 'Test', active: true }
    const expected = { $contains: { name: 'Test' } }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('should fail if object does not match subset', async () => {
    const actual = { id: 1, name: 'Test' }
    const expected = { $contains: { name: 'Dev' } }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(1)
  })

  it('should still support array contains (existing behavior)', async () => {
    const actual = [1, 2, 3]
    const expected = { $contains: 2 }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('should support nested object in array contains', async () => {
    const actual = [{ id: 1 }, { id: 2 }]
    const expected = { $contains: { id: 1 } }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('should work with string and regex expected (via validateMatch capabilities)', async () => {
    // Assuming validateMatch supports regex if passed as such (though typically via JSON/YAML it comes as string)
    // If we use JS objects directly:
    const actual = 'Hello World'
    const expected = { $contains: /World/ }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('should has loop in array', async () => {
    const actual = [
      { date: '2023-01-01', v: 10 },
      { date: '2023-01-03', v: 30 },
      { date: '2023-01-02', v: 20 },
    ]

    const rs = await validate(actual, {
      $contains: {
        date: {$expr: 'loop && typeof loop.index === "number" && loop.last'}
      }
    }, new ValidationContext())

    expect(rs.pass).toBe(true)
  })
})
