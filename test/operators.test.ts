import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'
import { ValidationOperatorHandler } from '../src/types.js'

describe('validate/operators', () => {
  it('$contains should pass if array contains item', async () => {
    const { failures } = await validate([1, 2, 3], { $contains: 2 }, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('$contains should pass if array contains object item', async () => {
    const { failures } = await validate([{ score: 0, title: 'hello' }, 2, 3], { $contains: { score: 0 } }, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('$contains should fail if array does not contain item', async () => {
    const { failures } = await validate([1, 2, 3], { $contains: 4 }, new ValidationContext())
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toBe('$contains mismatch: item not found in array')
  })

  it('$all should pass if all items are present', async () => {
    const { failures } = await validate([1, 2, 3], { $all: [1, 3] }, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('$all should fail if any item is missing', async () => {
    const { failures } = await validate([1, 2, 3], { $all: [1, 4] }, new ValidationContext())
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toBe('$contains mismatch: item not found in array')
  })

  it('$sequence should pass if items appear in order', async () => {
    const { failures } = await validate([1, 2, 3, 4], { $sequence: [2, 4] }, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('$sequence should fail if items appear out of order', async () => {
    const { failures } = await validate([1, 4, 2, 3], { $sequence: [2, 4] }, new ValidationContext())
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toContain('$sequence mismatch')
  })

  it('$sequence should has loop in array', async () => {
    const actual = [
      { date: '2023-01-01', v: 10 },
      { date: '2023-01-03', v: 30 },
      { date: '2023-01-02', v: 20 },
    ]

    const rs = await validate(actual, {
      $sequence: [{
        date: {$expr: 'loop && typeof loop.index === "number"'}
      }]
    }, new ValidationContext())

    expect(rs.pass).toBe(true)
  })

  it('$not should pass if value does not match', async () => {
    const { failures } = await validate('hello', { $not: 'world' }, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('$not should fail if value matches', async () => {
    const { failures } = await validate('hello', { $not: 'hello' }, new ValidationContext())
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toBe('$not mismatch: value matches expectation but should not')
  })

  it('$all with objects', async () => {
    const actual = [{ id: 1, type: 'a' }, { id: 2, type: 'b' }]
    const expected = {
      $all: [
        { type: 'b' },
        { id: 1 }
      ]
    }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('$all should has loop in array', async () => {
    const actual = [
      { date: '2023-01-01', v: 10 },
      { date: '2023-01-03', v: 30 },
      { date: '2023-01-02', v: 20 },
    ]

    const rs = await validate(actual, {
      $all: [{
        date: {$expr: 'loop && typeof loop.index === "number"'}
      }]
    }, new ValidationContext())

    expect(rs.pass).toBe(true)
  })

  it('$sequence with regex', async () => {
    const actual = ['start', 'processing', 'end']
    const expected = {
      $sequence: [
        /sta/,
        /end/
      ]
    }
    const { failures } = await validate(actual, expected, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  it('$not with complex object', async () => {
    const actual = { a: 1, b: 2 }
    const { failures } = await validate(actual, { $not: { a: 2 } }, new ValidationContext())
    expect(failures).toHaveLength(0)

    const { failures: failures2 } = await validate(actual, { $not: { a: 1 } }, new ValidationContext())
    expect(failures2).toHaveLength(1)
  })

  it('should support non-array actual (via delegation)', async () => {
    const { failures } = await validate({ a: 1 }, { $contains: { a: 1 } }, new ValidationContext())
    expect(failures).toHaveLength(0)
  })

  // --- $each operator tests ---
  describe('$each', () => {
    it('should iterate over arrays and validate each element', async () => {
      const actual = [
        { type: 'user', name: 'Alice' },
        { type: 'user', name: 'Bob' }
      ]
      const { failures } = await validate(actual, { $each: { type: 'user' } }, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should fail if any element does not match', async () => {
      const actual = [
        { type: 'user', name: 'Alice' },
        { type: 'admin', name: 'Bob' }
      ]
      const { failures } = await validate(actual, { $each: { type: 'user' } }, new ValidationContext())
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('String mismatch') // Or whatever nested error it yields
    })

    it('should fail on non-array input', async () => {
      const { failures } = await validate({ type: 'user' }, { $each: { type: 'user' } }, new ValidationContext())
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('$each operator requires an array')
    })

    it('should pass vacuously on empty array', async () => {
      const { failures } = await validate([], { $each: { type: 'user' } }, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should has loop in array', async () => {
      const actual = [
        { date: '2023-01-01', v: 10 },
        { date: '2023-01-03', v: 30 },
        { date: '2023-01-02', v: 20 },
      ]

      const rs = await validate(actual, {
        $each: {
          date: {$expr: 'loop && typeof loop.index === "number"'}
        }
      }, new ValidationContext())

      expect(rs.pass).toBe(true)
    })
  })


  // --- New tests for updated 'expects' logic ---
  describe('operator requires array actual', () => {
    // Dummy operator for testing expects as array
    const dummyArrayExpectsOperator: ValidationOperatorHandler & { expects?: string[] | string } = async (actual, expected, ctx, validateMatch) => {
      // This operator expects an array and will simply pass if actual is an array
      if (Array.isArray(actual)) {
        return true
      } else {
        return 'Dummy operator internal failure: expected array'
      }
    };
    dummyArrayExpectsOperator.expects = ['array']; // Explicitly set expects as an array, covering the new core.ts logic

    const dummyStringExpectsOperator: ValidationOperatorHandler & { expects?: string[] | string } = async (actual, expected, ctx, validateMatch) => {
      if (typeof actual === 'string') {
        return true
      } else {
        return 'Dummy operator internal failure: expected string'
      }
    };
    dummyStringExpectsOperator.expects = 'string'; // Explicitly set expects as a string


    it('should fail with correct message when $all is used on non-array actual', async () => {
      const { failures } = await validate({ a: 1 }, { $all: [1] }, new ValidationContext());
      expect(failures).toHaveLength(1);
      expect(failures[0].message).toContain('requires an array');
    });

    it('should fail with correct message when $sequence is used on non-array actual', async () => {
      const { failures } = await validate({ a: 1 }, { $sequence: [1] }, new ValidationContext());
      expect(failures).toHaveLength(1);
      expect(failures[0].message).toContain('requires an array');
    });

    it('should pass if custom operator with expects = ["array"] is used on array actual', async () => {
      const { failures } = await validate([1, 2, 3], { $customArrayOp: 'any' }, new ValidationContext({
        operators: {
          $customArrayOp: dummyArrayExpectsOperator
        }
      }));
      expect(failures).toHaveLength(0);
    });

    it('should fail if custom operator with expects = ["array"] is used on non-array actual', async () => {
      const { failures } = await validate({ a: 1 }, { $customArrayOp: 'any' }, new ValidationContext({
        operators: {
          $customArrayOp: dummyArrayExpectsOperator
        }
      }));
      expect(failures).toHaveLength(1);
      // The message comes from core.ts's 'needsArray' check
      expect(failures[0].message).toContain('expected array');
    });

    // Test that the 'requires an array' check is NOT triggered if 'expects' is not related to 'array'
    it('should NOT fail with "requires an array" message if custom operator expects string and gets non-string', async () => {
      const { failures } = await validate([1, 2], { $customStringOp: 'world' }, new ValidationContext({
        operators: {
          $customStringOp: dummyStringExpectsOperator
        }
      }));
      expect(failures).toHaveLength(1);
      // The failure message should come from the dummy operator's internal check, not core.ts's 'requires an array'
      expect(failures[0].message).toContain('Dummy operator internal failure: expected string');
      expect(failures[0].message).not.toContain('requires an array');
    });
  });
  // --- End new tests ---


  describe('$schema', () => {
    it('should validate using $schema operator', async () => {
      const { failures } = await validate(123, { $schema: { type: 'number' } }, new ValidationContext())
      expect(failures).toHaveLength(0)

      const { failures: failures2 } = await validate('abc', { $schema: { type: 'number' } }, new ValidationContext())
      expect(failures2).toHaveLength(1)
      expect(failures2[0].message).toBe('JSON Schema validation failed')
    })

    it('should support templates in $schema operator', async () => {
      const { failures } = await validate('AI', {
        $schema: { type: 'string', pattern: '^{{prefix}}' }
      }, new ValidationContext({ data: { prefix: 'AI' } }))
      expect(failures).toHaveLength(0)
    })

    it('should validate complex objects with $schema', async () => {
      const actual = { id: 1, name: 'Alice' }
      const schema = {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' }
        }
      }
      const { failures } = await validate(actual, { $schema: schema }, new ValidationContext())
      expect(failures).toHaveLength(0)
    })

    it('should work with $not and $schema combined', async () => {
      const { failures } = await validate(123, { $not: { $schema: { type: 'string' } } }, new ValidationContext())
      expect(failures).toHaveLength(0)

      const { failures: failures2 } = await validate('abc', { $not: { $schema: { type: 'string' } } }, new ValidationContext())
      expect(failures2).toHaveLength(1)
      expect(failures2[0].message).toContain('$not mismatch')
    })

    it('should support $schema nested inside an object', async () => {
      const actual = {
        user: { id: 123, tags: ['a', 'b'] }
      }
      const expected = {
        user: {
          id: 123,
          tags: { $schema: { type: 'array', minItems: 2 } }
        }
      }
      const { failures } = await validate(actual, expected, new ValidationContext())
      expect(failures).toHaveLength(0)
    })
  })

  // --- Comparison Operators Tests ---
  describe('comparison operators', () => {
    it('$eq should pass on equality', async () => {
      const { failures, pass } = await validate(18, { $eq: 18 }, new ValidationContext())
      expect(pass).toBe(true)
      expect(failures).toHaveLength(0)
    })

    it('$ne should pass on inequality', async () => {
      const { failures, pass } = await validate(18, { $ne: 20 }, new ValidationContext())
      expect(pass).toBe(true)
      expect(failures).toHaveLength(0)
    })

    it('$gt should pass when greater', async () => {
      const { failures, pass } = await validate(20, { $gt: 18 }, new ValidationContext())
      expect(pass).toBe(true)
      expect(failures).toHaveLength(0)

      const { pass: failPass } = await validate(18, { $gt: 18 }, new ValidationContext())
      expect(failPass).toBe(false)
    })

    it('$gte should pass when greater or equal', async () => {
      const { pass } = await validate(18, { $gte: 18 }, new ValidationContext())
      expect(pass).toBe(true)
    })

    it('$lt should pass when less', async () => {
      const { pass } = await validate(10, { $lt: 18 }, new ValidationContext())
      expect(pass).toBe(true)
    })

    it('$lte should pass when less or equal', async () => {
      const { pass } = await validate(18, { $lte: 18 }, new ValidationContext())
      expect(pass).toBe(true)
    })

    it('$in should pass if in array', async () => {
      const { pass } = await validate('active', { $in: ['active', 'pending'] }, new ValidationContext())
      expect(pass).toBe(true)

      const { failures, pass: failPass } = await validate('deleted', { $in: ['active', 'pending'] }, new ValidationContext())
      expect(failPass).toBe(false)
      expect(failures[0].message).toBe('Value should be in expected array')
    })

    it('$nin should pass if not in array', async () => {
      const { pass } = await validate('deleted', { $nin: ['active', 'pending'] }, new ValidationContext())
      expect(pass).toBe(true)
    })
  })

  // --- $expr operator tests ---
  describe('$expr', () => {
    it('should validate root actual', async () => {
      const { failures, pass } = await validate({o: {i: 10}, o1: 3}, {o: {i: { $expr: 'ctx.actual.o1 === 3' }}}, new ValidationContext())
      expect(pass).toBe(true)
      expect(failures).toHaveLength(0)
    })

    it('should validate simple synchronous expression', async () => {
      const { failures, pass } = await validate(10, { $expr: 'actual > 5' }, new ValidationContext())
      expect(pass).toBe(true)
      expect(failures).toHaveLength(0)
    })

    it('should validate expression with data and input context', async () => {
      const ctx = new ValidationContext({ data: { threshold: 5 } })
      const { failures, pass } = await validate(10, { $expr: 'actual > data.threshold' }, ctx)
      expect(pass).toBe(true)
      expect(failures).toHaveLength(0)
    })

    it('should fail when expression is false', async () => {
      const { failures, pass } = await validate(2, { $expr: 'actual > 5' }, new ValidationContext())
      expect(pass).toBe(false)
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toBe('Expression evaluated to false')
    })

    it('should handle async expressions', async () => {
      const { failures, pass } = await validate(10, { $expr: 'await Promise.resolve(actual * 2) === 20' }, new ValidationContext())
      expect(pass).toBe(true)
      expect(failures).toHaveLength(0)
    })

    it('should return 0 score and fail when expression errors', async () => {
      const { failures, pass } = await validate(10, { $expr: 'actual.toString().nonExistentMethod()' }, new ValidationContext())
      expect(pass).toBe(false)
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('$expr evaluation error')
    })
  })
})
