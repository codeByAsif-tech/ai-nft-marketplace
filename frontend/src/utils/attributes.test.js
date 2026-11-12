import { describe, expect, it } from 'vitest'
import { cleanAttributes, validateAttributes } from './attributes'

describe('validateAttributes', () => {
  it('accepts valid traits and ignores fully blank rows', () => {
    expect(
      validateAttributes([
        { trait_type: 'Mood', value: 'Calm' },
        { trait_type: '', value: '' },
      ]),
    ).toBe('')
  })

  it('requires both a name and a value', () => {
    expect(validateAttributes([{ trait_type: 'Mood', value: '' }])).toMatch(/both/)
    expect(validateAttributes([{ trait_type: '', value: 'Calm' }])).toMatch(/both/)
  })

  it('rejects duplicate trait names regardless of case', () => {
    expect(
      validateAttributes([
        { trait_type: 'Mood', value: 'a' },
        { trait_type: ' mood ', value: 'b' },
      ]),
    ).toMatch(/twice/)
  })
})

describe('cleanAttributes', () => {
  it('trims values and drops empty rows', () => {
    expect(
      cleanAttributes([
        { trait_type: ' Mood ', value: ' Calm ' },
        { trait_type: '', value: '' },
        { trait_type: 'Year', value: 2026 },
      ]),
    ).toEqual([
      { trait_type: 'Mood', value: 'Calm' },
      { trait_type: 'Year', value: '2026' },
    ])
  })
})
