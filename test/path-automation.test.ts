import { describe, it, expect } from 'vitest'
import { validate } from '../src/core.js'
import { ValidationContext } from '../src/types.js'

describe('validate/path-automation', () => {
  it('should generate virtual paths for single-element containers', async () => {
    const ctx = new ValidationContext()
    const expected = {
      $and: [
        { name: 'test' }
      ]
    }
    const actual = { name: 'test' }

    const result = await validate(actual, expected, ctx)

    expect(result.pass).toBe(true)
    // 验证单元素 $and 真正透明：它不增加层级，details 直接是子项的节点
    expect(result.details![0].key).toBe('name')
    })
  it('should generate indexed paths for multi-element containers', async () => {
    const ctx = new ValidationContext()
    const expected = {
      $and: [
        { name: 'test1' },
        { name: 'test2' }
      ]
    }
    const actual = { name: 'test1' } // This will fail for the second element

    const result = await validate(actual, expected, ctx)

    expect(result.pass).toBe(false)
    // 验证多元素产生 $and[0], $and[1]
    expect(result.details![0].key).toBe('$and[0]')
    expect(result.details![1].key).toBe('$and[1]')
  })

  it('should support custom path templates', async () => {
    // 模拟一个带自定义模板的算子（在测试中动态注入）
    const customOperator = async (actual: any, expected: any, ctx: any, validateMatch: any) => {
      const subCtx = ctx.createChildContext('key', 2)
      return await validateMatch(actual, expected, subCtx)
    }
    customOperator.virtual = '$operator($key)'

    const ctx = new ValidationContext({
      operators: { $custom: customOperator }
    })
    const expected = { $custom: 'test' }
    const actual = 'test'

    const result = await validate(actual, expected, ctx)
    expect(result.details![0].key).toBe('$custom(key)')
  })

  it('should patch metadata (title, dimension) to deep nodes', async () => {
    const ctx = new ValidationContext()
    const expected = {
      $and: [
        {
          name: 'test',
          $score: { value: 10, dimension: 'security', title: 'Check Name' }
        }
      ]
    }
    const actual = { name: 'test' }

    const result = await validate(actual, expected, ctx)

    // 顶层 details 应携带 metadata
    const detail = result.details![0]
    expect(detail.dimension).toBe('security')
    expect(detail.title).toBe('Check Name')
    expect(detail.key).toBe('name')
  })

  it('should support $index and $count in path templates', async () => {
    const customOperator = async (actual: any, expected: any, ctx: any, validateMatch: any) => {
      const weights = ctx.distribute(Array(expected.length).fill(null))
      const results = []
      for (let i = 0; i < expected.length; i++) {
        const subCtx = ctx.createChildContext(i, expected.length)
        results.push(await validateMatch(actual[i], expected[i], subCtx))
      }
      return ctx.aggregate(results, weights)
    }
    customOperator.virtual = 'item_$index_of_$count'

    const ctx = new ValidationContext({ operators: { $batch: customOperator } })
    const expected = { $batch: ['a', 'b'] }
    const actual = ['a', 'b']

    const result = await validate(actual, expected, ctx)
    expect(result.details![0].key).toBe('item_0_of_2')
    expect(result.details![1].key).toBe('item_1_of_2')
  })

  it('should handle multi-layer ghost penetration', async () => {
    const ctx = new ValidationContext()
    const expected = {
      $and: [ // count = 1, virtual
        {
          $or: [ // count = 1, virtual
            { name: 'test' }
          ]
        }
      ]
    }
    const actual = { name: 'test' }

    const result = await validate(actual, expected, ctx)
    // 路径应直接穿透到 name，不留任何空键层级
    expect(result.details![0].key).toBe('name')
    expect(result.details).toHaveLength(1)
  })

  it('should respect metadata overriding (child takes precedence)', async () => {
    const ctx = new ValidationContext()
    const expected = {
      $and: [
        {
          name: 'test',
          $score: { dimension: 'inner' }
        }
      ],
      $score: { dimension: 'outer' }
    }
    const actual = { name: 'test' }

    const result = await validate(actual, expected, ctx)
    // 根据 patchMatchResult 逻辑，内层 dimension 应被保留
    expect(result.details![0].dimension).toBe('inner')
    })

  it('should generate traditional paths for non-virtual operators', async () => {
    const customOp = async (actual: any, expected: any, ctx: any, validateMatch: any) => {
      const subCtx = ctx.createChildContext(0, 2)
      return await validateMatch(actual, expected, subCtx)
    }
    customOp.virtual = false // 显式关闭透明

    const ctx = new ValidationContext({ operators: { $strict: customOp } })
    const expected = { $strict: 'test' }
    const actual = 'test'

    const result = await validate(actual, expected, ctx)
    // 注意：validateOperator 内部对于非透明算子会调用 createSubContext(operator)
    // 路径会变成 $strict[0]
    expect(result.details![0].key).toBe('$strict[0]')
    })

    it('should perform defensive type checking in array operators', async () => {

    const ctx = new ValidationContext()

    // 测试 $all 接收非数组输入
    const resAll = await validate('not-an-array', { $all: ['test'] }, ctx)
    expect(resAll.pass).toBe(false)
    expect(resAll.failures[0].message).toContain('$all operator requires an array')

    // 测试 $sequence 接收非数组输入
    const resSeq = await validate({}, { $sequence: ['test'] }, ctx)
    expect(resSeq.pass).toBe(false)
    expect(resSeq.failures[0].message).toContain('$sequence operator requires an array')
  })
})
