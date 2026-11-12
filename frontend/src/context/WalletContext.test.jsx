import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useWallet } from '../hooks/useWallet'
import { createMockEthereum } from '../test/mockEthereum'
import { WalletProvider } from './WalletContext'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const SEPOLIA_HEX = '0xaa36a7'
const BASE_SEPOLIA_HEX = '0x14a34'

const wrapper = ({ children }) => <WalletProvider>{children}</WalletProvider>
const renderWallet = () => renderHook(() => useWallet(), { wrapper })

let ethereum

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  delete window.ethereum
})

function install(options) {
  ethereum = createMockEthereum(options)
  window.ethereum = ethereum
  return ethereum
}

describe('WalletProvider', () => {
  it('reports MetaMask as unavailable when no provider is injected', () => {
    const { result } = renderWallet()
    expect(result.current.isMetaMaskInstalled).toBe(false)
    expect(result.current.status).toBe('unavailable')
  })

  it('restores an existing connection silently with eth_accounts', async () => {
    install({ accounts: [ALICE] })
    const { result } = renderWallet()

    await waitFor(() => expect(result.current.isConnected).toBe(true))
    expect(result.current.account).toBe(ALICE)
    expect(result.current.network.name).toBe('Ethereum Sepolia')
    expect(ethereum.calls.some((c) => c.method === 'eth_requestAccounts')).toBe(false)
  })

  it('connects with eth_requestAccounts and loads the balance', async () => {
    install()
    const { result } = renderWallet()

    await act(() => result.current.connect())
    expect(result.current.isConnected).toBe(true)
    expect(result.current.account).toBe(ALICE)

    await waitFor(() => expect(result.current.balance).toBe('1.0'))
    expect(result.current.balanceLoading).toBe(false)
  })

  it('shows a friendly error when the user rejects the connection', async () => {
    install()
    ethereum.failNext('eth_requestAccounts', 4001, 'User rejected the request.')
    const { result } = renderWallet()

    await act(() => result.current.connect())
    expect(result.current.isConnected).toBe(false)
    expect(result.current.status).toBe('disconnected')
    expect(result.current.error).toBe('Request cancelled in your wallet.')
  })

  it('explains a pending MetaMask request (-32002)', async () => {
    install()
    ethereum.failNext('eth_requestAccounts', -32002, 'Already processing')
    const { result } = renderWallet()

    await act(() => result.current.connect())
    expect(result.current.error).toMatch(/already open/i)
  })

  it('follows accountsChanged and disconnects when accounts are empty', async () => {
    install({ accounts: [ALICE] })
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.account).toBe(ALICE))

    act(() => ethereum.emit('accountsChanged', [BOB]))
    expect(result.current.account).toBe(BOB)

    act(() => ethereum.emit('accountsChanged', []))
    expect(result.current.isConnected).toBe(false)
    expect(result.current.account).toBe(null)
  })

  it('follows chainChanged and flags unsupported networks', async () => {
    install({ accounts: [ALICE] })
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    act(() => ethereum.emit('chainChanged', '0x1')) // Ethereum mainnet
    expect(result.current.chainId).toBe(1)
    expect(result.current.isSupportedNetwork).toBe(false)
    expect(result.current.network).toBe(null)

    act(() => ethereum.emit('chainChanged', BASE_SEPOLIA_HEX))
    expect(result.current.network.name).toBe('Base Sepolia')
  })

  it('re-fetches the balance for the new network after a chain change', async () => {
    install({ accounts: [ALICE] })
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.balance).toBe('1.0'))

    ethereum.state.balanceWei = '0x6f05b59d3b20000' // 0.5 ETH
    ethereum.state.chainId = BASE_SEPOLIA_HEX
    act(() => ethereum.emit('chainChanged', BASE_SEPOLIA_HEX))

    await waitFor(() => expect(result.current.balance).toBe('0.5'))
  })

  it('switches network with wallet_switchEthereumChain', async () => {
    install({ accounts: [ALICE], knownChains: [SEPOLIA_HEX, BASE_SEPOLIA_HEX] })
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    let ok
    await act(async () => {
      ok = await result.current.switchNetwork(84532)
    })
    expect(ok).toBe(true)
    expect(result.current.chainId).toBe(84532)
    expect(ethereum.calls.some((c) => c.method === 'wallet_addEthereumChain')).toBe(false)
  })

  it('adds the network first when MetaMask does not know it (4902)', async () => {
    install({ accounts: [ALICE], knownChains: [SEPOLIA_HEX] })
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    await act(() => result.current.switchNetwork(84532))
    const add = ethereum.calls.find((c) => c.method === 'wallet_addEthereumChain')
    expect(add.params[0]).toMatchObject({ chainId: BASE_SEPOLIA_HEX, chainName: 'Base Sepolia' })
    expect(result.current.chainId).toBe(84532)
  })

  it('reports a rejected network switch and stays on the current chain', async () => {
    install({ accounts: [ALICE], knownChains: [SEPOLIA_HEX, BASE_SEPOLIA_HEX] })
    ethereum.failNext('wallet_switchEthereumChain', 4001, 'User rejected')
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    let ok
    await act(async () => {
      ok = await result.current.switchNetwork(84532)
    })
    expect(ok).toBe(false)
    expect(result.current.chainId).toBe(11155111)
    expect(result.current.error).toBe('Request cancelled in your wallet.')
    expect(result.current.switchingTo).toBe(null)
  })

  it('refuses to switch to a network the app does not support', async () => {
    install({ accounts: [ALICE] })
    const { result } = renderWallet()
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    let ok
    await act(async () => {
      ok = await result.current.switchNetwork(1)
    })
    expect(ok).toBe(false)
    expect(ethereum.calls.some((c) => c.method === 'wallet_switchEthereumChain')).toBe(false)
  })

  it('disconnect clears state, ignores later account events and is remembered on reload', async () => {
    install({ accounts: [ALICE] })
    const first = renderWallet()
    await waitFor(() => expect(first.result.current.isConnected).toBe(true))

    await act(() => first.result.current.disconnect())
    expect(first.result.current.isConnected).toBe(false)

    act(() => ethereum.emit('accountsChanged', [BOB]))
    expect(first.result.current.account).toBe(null)
    first.unmount()

    // Simulate a page reload with the permission still granted in MetaMask.
    ethereum.state.accounts = [ALICE]
    const second = renderWallet()
    await act(async () => {})
    expect(second.result.current.isConnected).toBe(false)
  })

  it('removes every MetaMask listener on unmount', async () => {
    install({ accounts: [ALICE] })
    const { result, unmount } = renderWallet()
    await waitFor(() => expect(result.current.isConnected).toBe(true))

    expect(ethereum.listenerCount('accountsChanged')).toBe(1)
    expect(ethereum.listenerCount('chainChanged')).toBe(1)
    expect(ethereum.listenerCount('disconnect')).toBe(1)

    unmount()
    expect(ethereum.listenerCount('accountsChanged')).toBe(0)
    expect(ethereum.listenerCount('chainChanged')).toBe(0)
    expect(ethereum.listenerCount('disconnect')).toBe(0)
  })
})
