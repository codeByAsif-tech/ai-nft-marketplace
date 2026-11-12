import { describe, expect, it } from 'vitest'
import { validateRecipient } from './recipient'

const ME = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const MARKET = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

describe('validateRecipient', () => {
  it('accepts another wallet', () => {
    expect(validateRecipient(OTHER, { from: ME, blocked: [MARKET] })).toBe('')
  })

  it('accepts any letter case and surrounding spaces', () => {
    expect(validateRecipient(`  ${OTHER.toLowerCase()}  `, { from: ME })).toBe('')
  })

  it('rejects empty, malformed, zero, own and blocked addresses', () => {
    expect(validateRecipient('', { from: ME })).toMatch(/Enter/)
    expect(validateRecipient('0x123', { from: ME })).toMatch(/not a valid/)
    expect(validateRecipient('0x0000000000000000000000000000000000000000', { from: ME })).toMatch(/destroy/)
    expect(validateRecipient(ME.toLowerCase(), { from: ME })).toMatch(/your own/)
    expect(validateRecipient(MARKET, { from: ME, blocked: [MARKET] })).toMatch(/contract/)
  })
})
