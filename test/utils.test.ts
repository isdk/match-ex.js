import { describe, it, expect } from 'vitest'
import { isStrict } from '../src/utils.js'

describe('validate/utils', () => {
  describe('isStrict', () => {
    it('should return boolean if strict is boolean', () => {
      expect(isStrict('object', true)).toBe(true)
      expect(isStrict('object', false)).toBe(false)
    })

    it('should return true if strict matches type string', () => {
      expect(isStrict('object', 'object')).toBe(true)
      expect(isStrict('array', 'array')).toBe(true)
      expect(isStrict('diff', 'diff')).toBe(true)
      expect(isStrict('object', 'array')).toBe(false)
    })

    it('should return true if type is in strict array', () => {
      expect(isStrict('object', ['object', 'array'])).toBe(true)
      expect(isStrict('array', ['object', 'array'])).toBe(true)
      expect(isStrict('diff', ['object', 'array'])).toBe(false)
    })

    it('should return false for other inputs', () => {
      expect(isStrict('object', undefined)).toBe(false)
      expect(isStrict('object', null as any)).toBe(false)
      expect(isStrict('object', {} as any)).toBe(false)
    })
  })
})
