import { describe, it, expect } from 'vitest'
import { loadOperators } from '../src/loader.js'
import { ValidationContext, MatchResult } from '../src/types.js'
import { validate } from '../src/core.js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = join(__dirname, 'op-assets') // test/op-assets/ directory

describe('validate/custom-operators', () => {
  describe('loadOperators', () => {
    it('should load operators from an object (backward compatibility)', async () => {
      const operators = {
        myTest: `js://./custom-ops.js#testOp`
      }
      const loaded = await loadOperators(operators, baseDir)

      expect(loaded).toHaveProperty('$myTest')
      expect(typeof loaded.$myTest).toBe('function')
    })

    it('should load operators from an array with name inference', async () => {
      const operators = [
        `js://./custom-ops.js#testOp`,
        `js://./custom-ops.js#checkName`
      ]
      const loaded = await loadOperators(operators, baseDir)

      expect(loaded).toHaveProperty('$testOp')
      expect(loaded).toHaveProperty('$checkName')
      expect(typeof loaded.$testOp).toBe('function')
      expect(typeof loaded.$checkName).toBe('function')
    })

    it('should automatically prepend $ to operator names', async () => {
      const operators = {
        'noDollar': (act:any, exp:any) => act === exp
      }
      const loaded = await loadOperators(operators, baseDir)
      expect(loaded).toHaveProperty('$noDollar')
    })

    it('should infer name from filename if no export name provided', async () => {
      // For this, it would take the filename 'custom-ops'
      const operators = [
        `js://./custom-ops.js`
      ]
      const loaded = await loadOperators(operators, baseDir)
      expect(loaded).toHaveProperty('$customOps')
    })

    it('should correctly pass structured parameters to custom operators', async () => {
      const operators = [
        `js://./custom-ops.js#checkName`
      ]
      const loaded = await loadOperators(operators, baseDir)
      const checkNameOp = loaded.$checkName

      const ctx = new ValidationContext()
      const actual = 'John Doe'
      const expected = { firstName: 'John', lastName: 'Doe' }

      // Custom operator after wrapCustomOperator returns MatchResult
      const result = (await checkNameOp(actual, expected, ctx, async () => {
        return { score: 1, pass: true, failures: [] }
      })) as MatchResult
      expect(result.failures).toHaveLength(0)
      expect(result.pass).toBe(true)

      const badExpected = { firstName: 'Jane' }
      const badResult = (await checkNameOp(actual, badExpected, ctx, async () => {
        return { score: 0, pass: false, failures: [] }
      })) as MatchResult
      expect(badResult.failures.length).toBeGreaterThan(0)
      expect(badResult.failures[0].message).toContain('Name check failed')
    })

    it('should work with validate in a nested structure', async () => {
      const operators = [`js://./custom-ops.js#checkName`]
      const loaded = await loadOperators(operators, baseDir)

      const actual = {
        user: {
          fullName: 'John Doe'
        }
      }
      const expected = {
        user: {
          fullName: {
            $checkName: { firstName: 'John', lastName: 'Doe' }
          }
        }
      }

      const { failures } = await validate(actual, expected, new ValidationContext({ operators: loaded }))
      expect(failures).toHaveLength(0)
    })

    it('should support templates in operator parameters', async () => {
      const operators = [`js://./custom-ops.js#checkName`]
      const loaded = await loadOperators(operators, baseDir)

      const actual = 'John Doe'
      const expected = {
        $checkName: { firstName: '{{userFirstName}}', lastName: 'Doe' }
      }

      const { failures } = await validate(actual, expected, new ValidationContext({
        operators: loaded,
        data: { userFirstName: 'John' }
      }))
      expect(failures).toHaveLength(0)
    })

    it('should support $value convention for splitting value and options', async () => {
      const operators = [`js://./custom-ops.js#checkValue`]
      const loaded = await loadOperators(operators, baseDir)

      const actual = 'Hello World'
      const expected = {
        $checkValue: {
          $value: 'Hello World',
          minLength: 10
        }
      }

      const { failures } = await validate(actual, expected, new ValidationContext({ operators: loaded }))
      expect(failures).toHaveLength(0)

      const badExpected = {
        $checkValue: {
          $value: 'Hello World',
          minLength: 20
        }
      }
      const { failures: badFailures } = await validate(actual, badExpected, new ValidationContext({ operators: loaded }))
      expect(badFailures.length).toBeGreaterThan(0)
      expect(badFailures[0].message).toContain('minLength')
    })

    describe('Edge Cases & Name Inference', () => {
      it('should handle filenames with multiple dots', async () => {
        const operators = [`js://./my.special.op.js`]
        const opEntries = await loadOperators(operators, baseDir)
        // Correctly converted to camelCase
        expect(opEntries).toHaveProperty('$mySpecialOp')
      })

      it('should handle anonymous functions in array', async () => {
        const operators = [
          (a:any, e:any) => a === e,
          (a:any, e:any) => a !== e
        ]
        const opEntries = await loadOperators(operators, baseDir)
        expect(opEntries).toHaveProperty('$op0')
        expect(opEntries).toHaveProperty('$op1')
      })

      it('should not double-prepend $ if it already exists', async () => {
        const $alreadyHasDollar = () => true
        const operators = [$alreadyHasDollar]
        const opEntries = await loadOperators(operators, baseDir)
        expect(opEntries).toHaveProperty('$alreadyHasDollar')
        expect(opEntries).not.toHaveProperty('$$alreadyHasDollar')
      })

      it('should prioritize export name over filename', async () => {
        const operators = [`js://./custom-ops.js#checkName`]
        const opEntries = await loadOperators(operators, baseDir)
        expect(opEntries).toHaveProperty('$checkName')
        expect(opEntries).not.toHaveProperty('$custom-ops')
      })

      it('should handle deep paths correctly', async () => {
        const operators = [`js://./deep/path/to/myOp.js`]
        const opEntries = await loadOperators(operators, baseDir)
        expect(opEntries).toHaveProperty('$myOp')
      })

      it('should convert kebab-case filenames to camelCase identifiers', async () => {
        const operators = [`js://./kebab-case-op.js`]
        const opEntries = await loadOperators(operators, baseDir)
        expect(opEntries).toHaveProperty('$kebabCaseOp')
      })
    })

    describe('Error Handling & Context', () => {
      it('should throw clear error when module not found', async () => {
        const operators = [`js://./not-found.js`]
        await expect(loadOperators(operators, baseDir)).rejects.toThrow()
      })

      it('should throw error when export is not a function', async () => {
        const operators = [`js://./custom-ops.js#notAFunction`]
        // We need to add a non-function export to custom-ops.js for this
        await expect(loadOperators(operators, baseDir)).rejects.toThrow(/is not a function/)
      })

      it('should access input data through fixture', async () => {
        const operators = [
          (act: any, exp: any, fixture: any) => {
            return act === fixture.targetName
          },
        ]
        const loaded = await loadOperators(operators)

        const { failures } = await validate(
          'Alice',
          { $op0: true },
          new ValidationContext({
            operators: loaded,
            input: { targetName: 'Alice' },
          })
        )
        expect(failures).toHaveLength(0)
      })

      it('should have undefined $options when $value convention is not used', async () => {
        const operators = [
          (act: any, exp: any, fixture: any) => {
            return fixture.$options === undefined
          },
        ]
        const loaded = await loadOperators(operators)
        const { failures } = await validate(
          'test',
          { $op0: 'some-val' },
          new ValidationContext({ operators: loaded })
        )
        expect(failures).toHaveLength(0)
      })
    })
  })
})
