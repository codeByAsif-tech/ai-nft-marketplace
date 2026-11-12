import { useCallback, useState } from 'react'
import { parseApiError } from '../services/api'
import * as walletApi from '../services/wallet.service'
import { sameAddress } from '../utils/format'
import { isUserRejection, parseWalletError } from '../utils/walletErrors'
import { useAuth } from './useAuth'
import { useWallet } from './useWallet'

/**
 * Links the connected MetaMask account to the logged-in user:
 *   1. backend issues a one-time message (nonce, expires in minutes)
 *   2. user signs it in MetaMask (free, no transaction)
 *   3. backend recovers the signer from the signature and saves the address
 */
export function useWalletLink() {
  const { user, setUser } = useAuth()
  const { account, chainId, isSupportedNetwork, getSigner } = useWallet()
  const [step, setStep] = useState('idle') // idle | requesting | signing | verifying | unlinking
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const linkedAddress = user?.walletAddress || null
  const isLinked = Boolean(linkedAddress)
  const isCurrentAccountLinked = sameAddress(linkedAddress, account)

  const link = useCallback(async () => {
    setError('')
    setSuccess('')
    if (!account) return setError('Connect your wallet first.')
    if (!isSupportedNetwork) return setError('Switch to a supported network before verifying.')

    try {
      setStep('requesting')
      const { nonce, message } = await walletApi.requestWalletNonce({ address: account, chainId })

      setStep('signing')
      const signer = await getSigner()

      // The Chain ID inside the message is only text; it doesn't prove which
      // network MetaMask is on. Ask MetaMask directly, right before signing, so
      // a network switch after the nonce request is caught.
      const walletChainId = Number.parseInt(await signer.provider.send('eth_chainId', []), 16)
      if (walletChainId !== chainId) {
        throw new Error('Your wallet changed networks during verification. Please try again.')
      }

      const signature = await signer.signMessage(message)

      setStep('verifying')
      const updatedUser = await walletApi.verifyWalletSignature({ nonce, signature })
      setUser(updatedUser)
      setSuccess('Wallet verified and linked to your account.')
    } catch (err) {
      if (err?.response || err?.request) setError(parseApiError(err).message)
      else setError(isUserRejection(err) ? 'Signature request cancelled.' : parseWalletError(err))
    } finally {
      setStep('idle')
    }
  }, [account, chainId, isSupportedNetwork, getSigner, setUser])

  const unlink = useCallback(async () => {
    setError('')
    setSuccess('')
    setStep('unlinking')
    try {
      const updatedUser = await walletApi.unlinkWallet()
      setUser(updatedUser)
      setSuccess('Wallet unlinked from your account.')
    } catch (err) {
      setError(parseApiError(err).message)
    } finally {
      setStep('idle')
    }
  }, [setUser])

  return {
    linkedAddress,
    isLinked,
    isCurrentAccountLinked,
    step,
    busy: step !== 'idle',
    error,
    success,
    link,
    unlink,
  }
}
