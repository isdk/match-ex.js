import { describe, it, expect, beforeEach } from 'vitest';
import { processValidationResult } from '../src/utils.js';
import { ValidationContext, MatchResult } from '../src/types.js';
import { weightedSumStrategy, maxStrategy, getStrategy } from '../src/strategies.js';
import { validate } from '../src/core.js';

describe('processValidationResult', () => {
  let ctx: ValidationContext;
  let expected: any;
  let actual: any;

  beforeEach(() => {
    ctx = new ValidationContext({ allocatedScore: 100 });
    expected = 'someExpectedValue';
    actual = 'someActualValue';
  });

  // Helper to assert common properties
  const assertResult = (
    result: MatchResult,
    expectedPassed: boolean,
    expectedScore: number, // Normalized 0-1
    failureCount: number,
    message?: string,
    failureKey?: string
  ) => {
    expect(result.pass).toBe(expectedPassed);
    expect(result.score).toBeCloseTo(expectedScore);
    expect(result.failures.length).toBe(failureCount);
    if (failureCount > 0) {
      if (message) expect(result.failures[0].message).toContain(message);
      if (failureKey !== undefined) {
         expect(result.failures[0].key).toBe(failureKey);
      }
    }
  };

  it('should handle boolean true correctly', () => {
    const result = processValidationResult(true, expected, actual, ctx);
    assertResult(result, true, 1.0, 0);
  });

  it('should handle boolean false correctly', () => {
    const result = processValidationResult(false, expected, actual, ctx);
    assertResult(result, false, 0.0, 1, 'Validation failed');
  });

  it('should handle string message for failure correctly', () => {
    const result = processValidationResult('Error message', expected, actual, ctx);
    assertResult(result, false, 0.0, 1, 'Error message');
  });

  it('should handle number (score 0-1) correctly without threshold', () => {
    const result = processValidationResult(0.75, expected, actual, ctx);
    assertResult(result, true, 0.75, 0);
  });

  it('should handle number (score 0-1) with threshold - pass', () => {
    ctx = new ValidationContext({ threshold: 0.5 });
    const result = processValidationResult(0.6, expected, actual, ctx);
    assertResult(result, true, 0.6, 0);
  });

  it('should handle number (score 0-1) with threshold - fail', () => {
    ctx = new ValidationContext({ threshold: 0.8 });
    const result = processValidationResult(0.7, expected, actual, ctx);
    assertResult(result, false, 0.7, 1, 'Score 0.70 is below threshold 0.8');
  });

  it('should handle object { score: number } without threshold', () => {
    const result = processValidationResult({ score: 0.9 }, expected, actual, ctx);
    assertResult(result, true, 0.9, 0);
  });

  it('should handle object { score: number, message: string } without threshold', () => {
    const result = processValidationResult({ score: 0.1, message: 'Low score' }, expected, actual, ctx);
    assertResult(result, true, 0.1, 0); // Still passes if no threshold
  });

  it('should handle object { score: number } with threshold - pass', () => {
    ctx = new ValidationContext({ threshold: 0.5 });
    const result = processValidationResult({ score: 0.5 }, expected, actual, ctx);
    assertResult(result, true, 0.5, 0);
  });

  it('should handle object { score: number } with threshold - fail', () => {
    ctx = new ValidationContext({ threshold: 0.7 });
    const result = processValidationResult({ score: 0.6 }, expected, actual, ctx);
    assertResult(result, false, 0.6, 1, 'Score 0.60 is below threshold 0.7');
  });

  it('should handle object { score: number, message: string } with threshold - fail (custom message)', () => {
    ctx = new ValidationContext({ threshold: 0.7 });
    const result = processValidationResult({ score: 0.6, message: 'Custom failure message' }, expected, actual, ctx);
    assertResult(result, false, 0.6, 1, 'Custom failure message');
  });

  it('should handle object { score: number, pass: true } overriding threshold', () => {
    ctx = new ValidationContext({ threshold: 0.9 });
    const result = processValidationResult({ score: 0.1, pass: true }, expected, actual, ctx);
    assertResult(result, true, 0.1, 0);
  });

  it('should handle object { score: number, pass: false } overriding threshold', () => {
    ctx = new ValidationContext({ threshold: 0.1 });
    const result = processValidationResult({ score: 0.9, pass: false, message: 'Forced fail' }, expected, actual, ctx);
    assertResult(result, false, 0.9, 1, 'Forced fail');
  });

  it('should handle unknown result type as failure', () => {
    const result = processValidationResult({ unknown: 'type' } as any, expected, actual, ctx);
    assertResult(result, false, 0.0, 1, 'Invalid validation result');
  });

  it('should correctly populate failure key from context', () => {
    ctx = new ValidationContext({ key: 'my.path' });
    const result = processValidationResult(false, expected, actual, ctx);
    assertResult(result, false, 0.0, 1, 'Validation failed', 'my.path');
  });

  it('should ensure score is clamped between 0 and 1 for number results', () => {
    let result = processValidationResult(1.5, expected, actual, ctx);
    assertResult(result, true, 1.0, 0);

    result = processValidationResult(-0.5, expected, actual, ctx);
    assertResult(result, true, 0.0, 0);
  });
});

describe('Scoring Strategies', () => {
  describe('weightedSumStrategy', () => {
    it('should distribute weights equally if no explicit scores', () => {
      const items = [null, null, null];
      const weights = weightedSumStrategy.distribute(items);
      expect(weights.length).toBe(3);
      // totalUnassignedWeight defaults to 0.1, but if everything is null,
      // they should take the whole 1.0 space.
      expect(weights.every(w => Math.abs(w - 1 / 3) < 0.001)).toBe(true);
    });

    it('should distribute weights based on explicit numeric scores', () => {
      const items = [1, 2, null]; // scores of 1, 2, and unassigned
      const weights = weightedSumStrategy.distribute(items, {maxScore: 4, totalUnassignedWeight: 0.1 });
      // scale = max(4, 2) = 4
      // confidences: [1/4, 2/4, null] = [0.25, 0.5, null]
      // explicitSum = 0.75. 0.75 + 0.1 <= 1.0 (True)
      // unassigned gets 1.0 - 0.75 = 0.25
      // weights: [0.25, 0.5, 0.25]
      expect(weights[0]).toBeCloseTo(0.25);
      expect(weights[1]).toBeCloseTo(0.5);
      expect(weights[2]).toBeCloseTo(0.25);
    });

    it('should aggregate scores correctly', () => {
      const results: MatchResult[] = [
          { score: 0.8, pass: true, failures: [] }, // 80%
          { score: 0.6, pass: true, failures: [] }  // 60%
      ];
      const weights = [0.5, 0.5];

      const aggregated = weightedSumStrategy.aggregate(results, weights);
      // 0.8*0.5 + 0.6*0.5 = 0.4 + 0.3 = 0.7
      expect(aggregated.score).toBeCloseTo(0.7);
      expect(aggregated.pass).toBe(true);
    });

    it('should fail aggregate if any child failed', () => {
      const results: MatchResult[] = [
          { score: 1.0, pass: true, failures: [] },
          { score: 0.0, pass: false, failures: [{ message: 'fail' }] }
      ];
      const weights = [0.5, 0.5];

      const aggregated = weightedSumStrategy.aggregate(results, weights);
      expect(aggregated.score).toBe(0.5);
      expect(aggregated.pass).toBe(false);
      expect(aggregated.failures.length).toBe(1);
    });
  });

  describe('maxStrategy', () => {
    it('should distribute weights with independent scale', () => {
      const items = [null, null, null];
      const weights = maxStrategy.distribute(items, { totalUnassignedWeight: 0.1 });
      // In independent mode, unassigned items share the budget
      expect(weights.every(w => Math.abs(w - 0.1 / 3) < 0.001)).toBe(true);
    });

    it('should use explicit scores as confidence in max strategy', () => {
      const items = [80, null];
      const weights = maxStrategy.distribute(items, { maxScore: 100, totalUnassignedWeight: 0.5 });
      // item 0: 80/100 = 0.8
      // item 1: 0.5/1 = 0.5
      expect(weights[0]).toBeCloseTo(0.8);
      expect(weights[1]).toBeCloseTo(0.5);
    });

    it('should aggregate by taking the maximum child score', () => {
      const results: MatchResult[] = [
          { score: 0.8, pass: true, failures: [] },
          { score: 0.9, pass: true, failures: [] }
      ];
      const weights = [1, 1]; // Weights ignored by max logic for score selection

      const aggregated = maxStrategy.aggregate(results, weights);
      expect(aggregated.score).toBe(0.9);
      expect(aggregated.pass).toBe(true);
    });

    it('should pass if any child passed', () => {
        const results: MatchResult[] = [
            { score: 0.0, pass: false, failures: [{message:'fail'}] },
            { score: 0.5, pass: true, failures: [] }
        ];
        const weights = [1, 1];

        const aggregated = maxStrategy.aggregate(results, weights);
        expect(aggregated.pass).toBe(true);
        expect(aggregated.score).toBe(0.5);
        expect(aggregated.failures.length).toBe(0); // Failures cleared on pass
    });

    it('should return a summary failure if all failed', () => {
        const results: MatchResult[] = [
            { score: 0.1, pass: false, failures: [{message:'fail1'}] },
            { score: 0.2, pass: false, failures: [{message:'fail2'}] }
        ];
        const weights = [1, 1];

        const aggregated = maxStrategy.aggregate(results, weights);
        expect(aggregated.pass).toBe(false);
        expect(aggregated.score).toBe(0.2); // Max score even if failed
        expect(aggregated.failures.length).toBe(1); // Summary failure
        expect(aggregated.failures[0].message).toContain('none of the conditions met');
        expect(aggregated.failures[0].message).toContain('Branch 0: fail1');
        expect(aggregated.failures[0].message).toContain('Branch 1: fail2');
    });
  });

  describe('getStrategy', () => {
    it('should return weightedSumStrategy for "weighted" or unknown names', () => {
      expect(getStrategy('weighted')).toBe(weightedSumStrategy);
      expect(getStrategy('and')).toBe(weightedSumStrategy); // Alias
      expect(getStrategy('unknown')).toBe(weightedSumStrategy);
      expect(getStrategy(undefined)).toBe(weightedSumStrategy);
    });

    it('should return maxStrategy for "max" or "or" names', () => {
      expect(getStrategy('max')).toBe(maxStrategy);
      expect(getStrategy('or')).toBe(maxStrategy); // Alias
    });
  });
});

describe('Integration Reproduction', () => {
  it('reproduce mixed weights calculation', async () => {
    const expected = {
      a: { $expect: 'A', $score: 0.8 },
      b: { $expect: 'B', $score: 20 }
    };
    const actual = { a: 'A', b: 'WRONG' };
    const ctx = new ValidationContext({ maxScore: 100 });

    const result = await validate(actual, expected, ctx);
    // Weights: A is 0.8 Confidence and B is 20/100 Confidence.
    // Score = 0.8
    expect(result.score).toBeCloseTo(0.8, 3);
  });
});
