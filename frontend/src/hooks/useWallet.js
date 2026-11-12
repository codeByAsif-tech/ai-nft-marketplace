import { useContext } from 'react'
import { WalletContext } from '../context/wallet-context'

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
