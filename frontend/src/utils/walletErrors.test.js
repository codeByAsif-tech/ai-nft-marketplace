import { describe, expect, it } from 'vitest'
import { getWalletErrorCode, isUserRejection, parseWalletError } from './walletErrors'

describe('walletErrors', () => {
  it('detects a direct MetaMask rejection (4001)', () => {
    expect(isUserRejection({ code: 4001 })).toBe(true)
  })

  it('detects an ethers-wrapped rejection (ACTION_REJECTED)', () => {
    expect(isUserRejection({ code: 'ACTION_REJECTED', info: { error: { code: 4001 } } })).toBe(true)
  })

  it('finds the 4902 code that MetaMask mobile nests inside -32603', () => {
    expect(getWalletErrorCode({ code: -32603, data: { originalError: { code: 4902 } } })).toBe(4902)
  })

  it('maps known codes to readable messages', () => {
    expect(parseWalletError({ code: -32002 })).toMatch(/already open/i)
    expect(parseWalletError({ code: 4100 })).toMatch(/not connected/i)
  })

  it('falls back to the ethers shortMessage, then message', () => {
    expect(parseWalletError({ shortMessage: 'short', message: 'long' })).toBe('short')
    expect(parseWalletError({ message: 'long' })).toBe('long')
    expect(parseWalletError(undefined)).toBe('Wallet request failed.')
  })
})
