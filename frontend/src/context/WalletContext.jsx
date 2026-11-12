import { BrowserProvider, formatEther, getAddress } from 'ethers'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getNetworkByChainId } from '../config/networks'
import { getInjectedProvider } from '../utils/ethereum'
import { parseWalletError, WALLET_ERROR, getWalletErrorCode } from '../utils/walletErrors'
import { WalletContext } from './wallet-context'

// Set when the user clicks "Disconnect" so we don't silently reconnect on reload.
const DISCONNECTED_KEY = 'mintverse.wallet.disconnected'

function readDisconnectedFlag() {
  try {
    return localStorage.getItem(DISCONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

function writeDisconnectedFlag(value) {
  try {
    if (value) localStorage.setItem(DISCONNECTED_KEY, '1')
    else localStorage.removeItem(DISCONNECTED_KEY)
  } catch {
    /* storage unavailable */
  }
}

const toChecksum = (address) => {
  try {
    return getAddress(address)
  } catch {
    return null
  }
}

/**
 * Wallet state for the whole app. The private key never leaves MetaMask:
 * this context only reads public data (address, chain, balance) and asks
 * MetaMask to sign or send things, which the user approves in MetaMask.
 *
 * status: 'unavailable' (no MetaMask) | 'disconnected' | 'connecting' | 'connected'
 */
export function WalletProvider({ children }) {
  // Resolved once; MetaMask injects before page scripts run.
  const [ethereum] = useState(() => getInjectedProvider())

  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [status, setStatus] = useState(ethereum ? 'disconnected' : 'unavailable')
  const [error, setError] = useState(null)
  const [switchingTo, setSwitchingTo] = useState(null)

  // Ignore MetaMask account events after the user disconnects in the app.
  const appDisconnectedRef = useRef(readDisconnectedFlag())

  // --- Restore an existing connection without prompting (eth_accounts never opens MetaMask).
  useEffect(() => {
    if (!ethereum) return
    let cancelled = false

    ethereum
      .request({ method: 'eth_chainId' })
      .then((hex) => !cancelled && setChainId(Number.parseInt(hex, 16)))
      .catch(() => {})

    if (!appDisconnectedRef.current) {
      ethereum
        .request({ method: 'eth_accounts' })
        .then((accounts) => {
          if (cancelled || !accounts?.length) return
          setAccount(toChecksum(accounts[0]))
          setStatus('connected')
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [ethereum])

  // --- MetaMask events. Listeners are removed on unmount to avoid leaks/duplicates.
  useEffect(() => {
    if (!ethereum?.on) return

    const handleAccountsChanged = (accounts) => {
      if (appDisconnectedRef.current) return
      if (!accounts || accounts.length === 0) {
        // User locked MetaMask or removed this site's permission.
        setAccount(null)
        setStatus('disconnected')
      } else {
        setAccount(toChecksum(accounts[0]))
        setStatus('connected')
      }
    }

    const handleChainChanged = (hex) => {
      // No page reload needed: everything that depends on chainId re-renders.
      setChainId(Number.parseInt(hex, 16))
      setSwitchingTo(null)
    }

    const handleDisconnect = () => {
      setAccount(null)
      setStatus('disconnected')
    }

    ethereum.on('accountsChanged', handleAccountsChanged)
    ethereum.on('chainChanged', handleChainChanged)
    ethereum.on('disconnect', handleDisconnect)

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged)
      ethereum.removeListener('chainChanged', handleChainChanged)
      ethereum.removeListener('disconnect', handleDisconnect)
    }
  }, [ethereum])

  // --- Balance for the connected account on the current network.
  // Each result is tagged with the account+chain it belongs to, so a slow
  // response for an old network can never overwrite the current one.
  const balanceKey = account && chainId ? `${account}:${chainId}` : null
  const [balanceTick, setBalanceTick] = useState(0)
  const [balanceState, setBalanceState] = useState({ key: null, tick: -1, value: null, error: null })

  useEffect(() => {
    if (!ethereum || !balanceKey) return
    let cancelled = false
    const [address] = balanceKey.split(':')

    new BrowserProvider(ethereum)
      .getBalance(address)
      .then((wei) => {
        if (!cancelled) setBalanceState({ key: balanceKey, tick: balanceTick, value: formatEther(wei), error: null })
      })
      .catch(() => {
        if (!cancelled)
          setBalanceState({ key: balanceKey, tick: balanceTick, value: null, error: 'Could not load balance' })
      })

    return () => {
      cancelled = true
    }
  }, [ethereum, balanceKey, balanceTick])

  const balanceCurrent = balanceState.key === balanceKey
  const balance = balanceCurrent ? balanceState.value : null
  const balanceError = balanceCurrent ? balanceState.error : null
  const balanceLoading = Boolean(balanceKey) && (!balanceCurrent || balanceState.tick !== balanceTick)

  const refreshBalance = useCallback(() => setBalanceTick((t) => t + 1), [])

  // --- Actions
  const connect = useCallback(async () => {
    if (!ethereum) {
      setError('MetaMask is not installed.')
      return null
    }
    setError(null)
    setStatus('connecting')
    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' })
      const hex = await ethereum.request({ method: 'eth_chainId' })
      const address = toChecksum(accounts?.[0])
      if (!address) throw new Error('No account returned by MetaMask.')

      appDisconnectedRef.current = false
      writeDisconnectedFlag(false)
      setAccount(address)
      setChainId(Number.parseInt(hex, 16))
      setStatus('connected')
      return address
    } catch (err) {
      setError(parseWalletError(err))
      setStatus('disconnected')
      return null
    }
  }, [ethereum])

  const disconnect = useCallback(async () => {
    appDisconnectedRef.current = true
    writeDisconnectedFlag(true)
    setAccount(null)
    setStatus(ethereum ? 'disconnected' : 'unavailable')
    setError(null)
    // Also revoke the site's permission where supported, so the next
    // "Connect" shows the MetaMask account picker again.
    try {
      await ethereum?.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] })
    } catch {
      /* older MetaMask versions: app-level disconnect is enough */
    }
  }, [ethereum])

  const switchNetwork = useCallback(
    async (targetChainId) => {
      const network = getNetworkByChainId(targetChainId)
      if (!ethereum || !network) return false
      setError(null)
      setSwitchingTo(network.chainId)
      try {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: network.chainIdHex }],
          })
        } catch (err) {
          // 4902: the network isn't added to MetaMask yet, so add it (this also switches).
          if (getWalletErrorCode(err) !== WALLET_ERROR.UNRECOGNIZED_CHAIN) throw err
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: network.chainIdHex,
                chainName: network.name,
                nativeCurrency: network.nativeCurrency,
                rpcUrls: network.rpcUrls,
                ...(network.explorerUrl ? { blockExplorerUrls: [network.explorerUrl] } : {}),
              },
            ],
          })
        }
        // Read back the chain in case the chainChanged event is delayed.
        const hex = await ethereum.request({ method: 'eth_chainId' })
        setChainId(Number.parseInt(hex, 16))
        return Number.parseInt(hex, 16) === network.chainId
      } catch (err) {
        setError(parseWalletError(err))
        return false
      } finally {
        setSwitchingTo(null)
      }
    },
    [ethereum],
  )

  /** Signer for the connected account. Signing always happens inside MetaMask. */
  const getSigner = useCallback(async () => {
    if (!ethereum || !account) throw new Error('Connect your wallet first.')
    return new BrowserProvider(ethereum).getSigner(account)
  }, [ethereum, account])

  const clearError = useCallback(() => setError(null), [])

  const network = getNetworkByChainId(chainId)

  const value = useMemo(
    () => ({
      isMetaMaskInstalled: Boolean(ethereum),
      status,
      isConnected: status === 'connected' && Boolean(account),
      isConnecting: status === 'connecting',
      account,
      chainId,
      network, // null when on an unsupported chain
      isSupportedNetwork: Boolean(network),
      switchingTo,
      balance,
      balanceLoading,
      balanceError,
      error,
      connect,
      disconnect,
      switchNetwork,
      refreshBalance,
      getSigner,
      clearError,
    }),
    [
      ethereum,
      status,
      account,
      chainId,
      network,
      switchingTo,
      balance,
      balanceLoading,
      balanceError,
      error,
      connect,
      disconnect,
      switchNetwork,
      refreshBalance,
      getSigner,
      clearError,
    ],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}
