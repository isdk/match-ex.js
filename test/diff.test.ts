import { describe, it, expect } from 'vitest'
import { validateMatch } from '../src/core.js'

describe('validate/diff', () => {
  it('should fail with diff info when string mismatch', async () => {
    const failures = await validateMatch('actual', 'expected')
    expect(failures).toHaveLength(1)
    expect(failures[0].diff).toBeDefined()
  })

  it('should pass if expectedDiff list matches', async () => {
    const failures = await validateMatch('hello world', 'hello', {
      input: {
        diff: [
          { value: ' world', added: true }
        ]
      }
    })
    expect(failures).toHaveLength(0)
  })

  it('should fail if expectedDiff list does not match all changes', async () => {
    const failures = await validateMatch('hello world!', 'hello', {
      input: {
        diff: [
          { value: ' world', added: true, required: true }
        ]
      }
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].message).toContain('unverified changes')
    expect(failures[0].message).toContain('missing required diff items')
  })

  it('should report both unverified and missing items', async () => {
    const failures = await validateMatch('hello world!', 'hello', {
      input: {
        diff: [
          { value: 'missing', added: true, required: true }
        ]
      }
    })
    expect(failures[0].message).toContain('unverified changes')
    expect(failures[0].message).toContain('missing required diff items')
  })

  it('should pass in non-strict diff mode with partial expectedDiff', async () => {
     const failures = await validateMatch('abcde', 'abc', {
       input: {
         diff: [{ value: 'de', added: true }]
       }
     })
     expect(failures).toHaveLength(0)
  })

  it('should fail in strict diff mode if extra changes exist', async () => {
    const failures = await validateMatch('abcde', 'abc', {
      strict: 'diff',
      input: {
        diff: []
      }
    })
    expect(failures).toHaveLength(1)
    expect(failures[0].message).include('unverified changes')
  })

  it('should pass in strict diff mode if all changes are matched', async () => {
    const failures = await validateMatch('abcde', 'abc', {
      strict: 'diff',
      input: {
        diff: [{ value: 'de', added: true }]
      }
    })
    expect(failures).toHaveLength(0)
  })

  it('should support RegExp in expectedDiff', async () => {
    const failures = await validateMatch('abcde', 'abc', {
      input: {
        diff: [{ value: /d/, added: true }]
      }
    })
    expect(failures).toHaveLength(0)
  })

  it('should pass with custom diff function', async () => {
    const failures = await validateMatch('hello world', 'hello', {
      input: {
        diff: (actual: any, input: any, diff: any) => {
          return diff // return all items as verified
        }
      }
    })
    expect(failures).toHaveLength(0)
  })

  describe('Chinese diff specific cases', () => {
    const expected = '这是应该输出的内容'
    const expectedDiff = [
      { value: '\n', added: true },
      { value: '的', removed: true },
      { value: '地', added: true }
    ]

    it('should match with replacements and extra newline', async () => {
      const actual = '这是应该输出地内容\n'
      const failures = await validateMatch(actual, expected, {
        input: { diff: expectedDiff }
      })
      expect(failures).toHaveLength(0)
    })

    it('should match original content by making expectedDiff optional', async () => {
      const actual = '这是应该输出的内容'
      const failures = await validateMatch(actual, expected, {
        input: { diff: expectedDiff }
      })
      expect(failures).toHaveLength(0)
    })

    it('should pass on equality even if diff: true is set', async () => {
      const failures = await validateMatch('hello', 'hello', {
        input: { diff: true }
      })
      expect(failures).toHaveLength(0)
    })

    it('should fail if a required diff item is missing', async () => {
      const actual = 'abc' // missing the 'd' that is required
      const failures = await validateMatch(actual, 'abc', {
        input: {
          diff: [{ value: 'd', added: true, required: true }]
        }
      })
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('missing required diff items: +"d"')
    })

    it('should pass if a required diff item is present', async () => {
      const actual = 'abcd'
      const failures = await validateMatch(actual, 'abc', {
        input: {
          diff: [{ value: 'd', added: true, required: true }]
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should fail on unverified changes by default (whitelist mode)', async () => {
      const actual = 'abcde'
      const failures = await validateMatch(actual, 'abc', {
        input: {
          diff: [{ value: 'd', added: true }]
        }
      })
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('unverified changes')
    })

    it('should pass on unverified changes if diffPermissive is true', async () => {
      const actual = 'abcde'
      const failures = await validateMatch(actual, 'abc', {
        input: {
          diff: [{ value: 'd', added: true }],
          diffPermissive: true
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should support diff options as an object', async () => {
      const actual = 'abcde'
      const failures = await validateMatch(actual, 'abc', {
        input: {
          diff: {
            items: [{ value: 'd', added: true }],
            permissive: true
          }
        }
      })
      expect(failures).toHaveLength(0)
    })
  })

  describe('New Diff Strategies (v2)', () => {
    it('should support string shorthand for diff type (auto)', async () => {
      const actual = '{"name": "test"}'
      const expected = '{"name": "old"}'
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'auto' }
      })
      expect(failures).toHaveLength(1)
      expect(failures[0].diff).toBeDefined()
    })

    it('should auto-detect JSON diff', async () => {
      const actual = { b: 2, a: 1 }
      const expected = { a: 1, b: 3 }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        input: { diff: 'auto' }
      })
      expect(failures).toHaveLength(1)
      const diff = failures[0].diff!
      // Structured diff: a is same, b is changed.
      expect(diff.find(d => d.path === 'a')).toBeFalsy()
      expect(diff.find(d => d.path === 'b' && d.removed)?.val).toBe(3)
      expect(diff.find(d => d.path === 'b' && d.added)?.val).toBe(2)
    })

    it('should auto-detect line diff for multi-line strings', async () => {
      const actual = 'line1\nline2 changed\nline3'
      const expected = 'line1\nline2\nline3'
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'auto' }
      })
      expect(failures).toHaveLength(1)
      const diff = failures[0].diff!
      expect(diff.filter(d => d.added || d.removed)).toHaveLength(2)
      expect(diff.find(d => d.value.includes('line2 changed'))?.added).toBe(true)
    })

    it('should auto-detect word diff for long single-line strings', async () => {
      const actual = 'This is a long sentence with some changes in it.'
      const expected = 'This is a long sentence with no changes in it.'
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'auto' }
      })
      expect(failures).toHaveLength(1)
      const diff = failures[0].diff!
      expect(diff.find(d => d.value === 'some')?.added).toBe(true)
      expect(diff.find(d => d.value === 'no')?.removed).toBe(true)
    })

    it('should fallback to diffChars in auto mode if high-level diff finds no changes but strings differ', async () => {
      const actual = 'Word1  Word2'
      const expected = 'Word1 Word2'
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'auto' }
      })
      expect(failures).toHaveLength(1)
      const diff = failures[0].diff!
      expect(diff.find(d => d.value === ' ')?.added).toBe(true)
    })

    it('should respect explicit lines diff with options', async () => {
      const actual = 'line1 \nline2'
      const expected = 'line1\nline2'
      const failures = await validateMatch(actual, expected, {
        input: {
          diff: {
            type: 'lines',
            ignoreWhitespace: true
          }
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should work with diff: { type: "json", items: [...] } using structured path', async () => {
      const actual = { status: 'success', data: { id: 2 } }
      const expected = { status: 'success', data: { id: 1 } }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        input: {
          diff: {
            type: 'json',
            items: [
              { path: 'data.id', val: 2, added: true }
            ],
            permissive: true
          }
        }
      })
      expect(failures).toHaveLength(0)
    })
  })

  describe('Advanced & Edge Cases (v2.1)', () => {
    it('should support ignoreCase in word diff', async () => {
      const actual = 'HELLO WORLD'
      const expected = 'hello world'
      const failures = await validateMatch(actual, expected, {
        input: {
          diff: { type: 'words', ignoreCase: true }
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should resolve templates in diff items', async () => {
      const actual = 'user: admin'
      const expected = 'user: guest'
      const failures = await validateMatch(actual, expected, {
        data: { role: 'admin' },
        input: {
          diff: [
            { value: 'guest', removed: true },
            { value: '{{role}}', added: true }
          ]
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should handle diffing against empty strings in auto mode', async () => {
      const actual = 'some content'
      const expected = ''
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'auto' }
      })
      expect(failures).toHaveLength(1)
      expect(failures[0].diff![0].added).toBe(true)
      expect(failures[0].diff![0].value).toBe('some content')
    })

    it('should handle whitespace-only differences with wordsWithSpace', async () => {
      const actual = 'word1  word2'
      const expected = 'word1 word2'
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'wordsWithSpace' }
      })
      expect(failures).toHaveLength(1)
      const diff = failures[0].diff!
      expect(diff.find(d => d.value === '  ')?.added).toBe(true)
      expect(diff.find(d => d.value === ' ')?.removed).toBe(true)
    })

    it('should support RegExp in lines mode whitelist', async () => {
      const actual = 'ID: 123\nStatus: OK'
      const expected = 'ID: 000\nStatus: OK'
      const failures = await validateMatch(actual, expected, {
        input: {
          diff: {
            type: 'lines',
            items: [
              { value: /^ID: \d+$/, added: true },
              { value: 'ID: 000', removed: true }
            ]
          }
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should NOT fallback in explicit mode (respect user intent)', async () => {
      const actual = 'Word1  Word2'
      const expected = 'Word1 Word2'
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'words' }
      })
      expect(failures).toHaveLength(0)
    })

    it('should NOT fallback for JSON semantic equality in auto mode', async () => {
      const actual = '{"a": 1, "b": 2}'
      const expected = '{"b": 2, "a": 1}'
      const failures = await validateMatch(actual, expected, {
        input: { diff: 'auto' }
      })
      expect(failures).toHaveLength(0)
    })

    it('should support structured array diff', async () => {
      const actual = { tags: ['ai', 'fast'] }
      const expected = { tags: ['ai', 'slow'] }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        input: {
          diff: {
            items: [
              { path: 'tags[1]', val: 'fast', added: true }
            ],
            permissive: true
          }
        }
      })
      expect(failures).toHaveLength(0)
    })
  })

  describe('Deep JSON Diff Validation (v2.2)', () => {
    it('should support RegExp for path matching', async () => {
      const actual = { metadata: { time: 100, version: '2.0' } }
      const expected = { metadata: { time: 0, version: '1.0' } }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        input: {
          diff: {
            items: [
              { path: /^metadata\..*$/, added: true }
            ],
            permissive: true
          }
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should fail in strict mode with unverified JSON changes', async () => {
      const actual = { a: 1, b: 2 }
      const expected = { a: 0, b: 0 }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        strict: 'diff',
        input: {
          diff: [
            { path: 'a', added: true }
            // b is missing
          ]
        }
      })
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('unverified changes')
    })

    it('should fail if a required path change is missing', async () => {
      const actual = { a: 1 }
      const expected = { a: 0 }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        input: {
          diff: {
            type: 'json',
            items: [
              { path: 'a', added: true },
              { path: 'must.change', added: true, required: true }
            ],
          }
        }
      })
      expect(failures).toHaveLength(1)
      expect(failures[0].message).toContain('missing required diff items: +"must.change"')
    })

    it('should handle complex values in structured diff', async () => {
      const actual = { data: [1, 2] }
      const expected = { data: [] }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        input: {
          diff: [
            { path: 'data[0]', val: 1, added: true },
            { path: 'data[1]', val: 2, added: true }
          ]
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should mix string value and path matching', async () => {
      const actual = { a: 1, b: 2 }
      const expected = { a: 0, b: 0 }
      const failures = await validateMatch(JSON.stringify(actual), JSON.stringify(expected), {
        input: {
          diff: {
            type: 'json',
            permissive: true,
            items: [
              { value: 'a: 1', added: true },
              { path: 'b', val: 2, added: true }
            ]
          }
        }
      })
      expect(failures).toHaveLength(0)
    })

    it('should default to auto diff when diff: true is set', async () => {
      const actual = '{"a": 1}'
      const expected = '{"a": 0}'
      const failures = await validateMatch(actual, expected, {
        input: { diff: true }
      })
      expect(failures).toHaveLength(1)
      // Check if it's using structured JSON diff (has path)
      expect(failures[0].diff![0].path).toBe('a')
    })
  })
})
