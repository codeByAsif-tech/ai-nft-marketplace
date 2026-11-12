import { Contract } from 'ethers'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getNetworkByChainId, txExplorerUrl } from '../../config/networks'
import { NFT_COLLECTION_ABI } from '../../contracts/nftCollection'
import { useAuth } from '../../hooks/useAuth'
import { useQuery } from '../../hooks/useQuery'
import { useWallet } from '../../hooks/useWallet'
import { parseApiError } from '../../services/api'
import { getNetworks, recordMint } from '../../services/nft.service'
import { sameAddress, shortenAddress } from '../../utils/format'
import { parseWalletError } from '../../utils/walletErrors'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'

const POLL_INTERVAL_MS = 3000
const POLL_ATTEMPTS = 40 // ~2 minutes

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function Check({ ok, children }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
          ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-slate-500'
        }`}
      >
        {ok ? '✓' : '•'}
      </span>
      <span className={ok ? 'text-slate-300' : 'text-slate-400'}>{children}</span>
    </li>
  )
}

/**
 * Mints an artwork that is on IPFS:
 *   1. MetaMask signs NFTCollection.mint(tokenURI) with the user's own wallet
 *   2. the tx hash is reported to the backend straight away (saved even if the tab closes)
 *   3. after confirmation, the backend verifies the receipt on-chain and records the NFT
 */
export default function MintPanel({ artwork, onMinted }) {
  const { user } = useAuth()
  const { isMetaMaskInstalled, isConnected, account, chainId, connect, switchNetwork, switchingTo, getSigner } =
    useWallet()
  const networks = useQuery('networks', getNetworks)

  const savedPending = artwork.mint?.status === 'PENDING' ? artwork.mint : null
  const [step, setStep] = useState(savedPending ? 'resumable' : 'idle') // idle|signing|pending|verifying|resumable
  const [tx, setTx] = useState(savedPending ? { hash: savedPending.txHash, chainId: savedPending.chainId } : null)
  const [error, setError] = useState(
    artwork.mint?.status === 'FAILED' && artwork.mint.error ? `Previous attempt failed: ${artwork.mint.error}` : '',
  )
  const [selectedChainId, setSelectedChainId] = useState(null)
  // True when the backend rejected the tx (reverted / failed verification): minting again is safe.
  const [canRemint, setCanRemint] = useState(artwork.mint?.status === 'FAILED')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const mintable = (networks.data ?? []).filter((n) => n.nftContract && getNetworkByChainId(n.chainId))
  const target =
    mintable.find((n) => n.chainId === selectedChainId) ?? mintable.find((n) => n.chainId === chainId) ?? mintable[0]

  const linkedWallet = user?.walletAddress
  const onLinkedAccount = isConnected && sameAddress(account, linkedWallet)
  const onTargetChain = Boolean(target) && chainId === target.chainId
  const ready = Boolean(linkedWallet) && onLinkedAccount && onTargetChain
  const busy = ['signing', 'pending', 'verifying'].includes(step)

  /** Asks the backend to verify the mint until it's confirmed (or clearly fails). */
  const verify = async (hash, txChainId) => {
    setStep('verifying')
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      const result = await recordMint({ generationId: artwork.id, chainId: txChainId, txHash: hash })
      if (result.state === 'CONFIRMED') {
        onMinted(result.nft, result.generation)
        return
      }
      if (!mounted.current) return
      await sleep(POLL_INTERVAL_MS)
    }
    throw new Error('Still waiting for confirmation. Use "Check status" again in a minute.')
  }

  const mint = async () => {
    setError('')
    if (!ready) return
    setStep('signing')
    try {
      const signer = await getSigner()
      // Re-check the chain right before signing (it can change at any moment).
      const liveChainId = Number.parseInt(await signer.provider.send('eth_chainId', []), 16)
      if (liveChainId !== target.chainId) throw new Error(`Switch MetaMask to ${target.name} and try again.`)

      // Don't waste a transaction on an empty address (e.g. a restarted local chain
      // where the contracts haven't been redeployed yet).
      const code = await signer.provider.getCode(target.nftContract)
      if (!code || code === '0x') {
        throw new Error(
          target.isLocal
            ? 'The NFT contract is not deployed on your local chain (it was probably restarted). Run "npm run deploy:local:reset" in the contracts folder, then try again.'
            : `No NFT contract found at the configured address on ${target.name}.`,
        )
      }

      const contract = new Contract(target.nftContract, NFT_COLLECTION_ABI, signer)
      const sent = await contract.mint(artwork.ipfs.metadataUri)
      const txInfo = { hash: sent.hash, chainId: target.chainId }
      setTx(txInfo)
      setStep('pending')

      // Save the hash on the server immediately (best effort), then wait for the block.
      recordMint({ generationId: artwork.id, chainId: txInfo.chainId, txHash: txInfo.hash }).catch(() => {})
      await sent.wait(1)

      await verify(txInfo.hash, txInfo.chainId)
    } catch (err) {
      if (!mounted.current) return
      setError(err?.response || err?.request ? parseApiError(err).message : parseWalletError(err))
      if ([400, 403].includes(err?.response?.status) || err?.code === 'CALL_EXCEPTION') setCanRemint(true)
      setStep((current) => (current === 'signing' ? 'idle' : 'resumable'))
    }
  }

  const checkStatus = async () => {
    if (!tx) return
    setError('')
    try {
      await verify(tx.hash, tx.chainId)
    } catch (err) {
      if (!mounted.current) return
      setError(err?.response || err?.request ? parseApiError(err).message : err.message)
      if ([400, 403].includes(err?.response?.status)) setCanRemint(true)
      setStep('resumable')
    }
  }

  const explorer = tx ? txExplorerUrl(tx.chainId, tx.hash) : null

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Mint NFT</h2>
        {target && <span className="text-xs text-slate-400">{target.name}</span>}
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Creates the NFT on-chain with your own wallet. You pay a small network fee in{' '}
        {target?.isLocal ? 'test ETH' : 'testnet ETH'}.
      </p>

      {networks.loading ? (
        <div className="mt-4 text-brand-300">
          <Spinner size="sm" />
        </div>
      ) : mintable.length === 0 ? (
        <Alert type="info" className="mt-4">
          No NFT contract is configured yet. Deploy the contracts and set the address in backend/.env (e.g.
          HARDHAT_NFT_CONTRACT), then restart the backend.
        </Alert>
      ) : (
        <>
          {mintable.length > 1 && !busy && step !== 'resumable' && (
            <div className="mt-4">
              <label htmlFor="mint-network" className="mb-1.5 block text-xs text-slate-400">
                Network
              </label>
              <select
                id="mint-network"
                value={target?.chainId ?? ''}
                onChange={(e) => setSelectedChainId(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              >
                {mintable.map((n) => (
                  <option key={n.chainId} value={n.chainId}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {step !== 'resumable' && !busy && (
            <ul className="mt-4 space-y-2">
              <Check ok={Boolean(linkedWallet)}>
                {linkedWallet ? (
                  <>Wallet verified ({shortenAddress(linkedWallet)})</>
                ) : (
                  <>
                    Verify your wallet on the{' '}
                    <Link to="/dashboard" className="text-brand-300 hover:text-brand-200">
                      Dashboard
                    </Link>
                  </>
                )}
              </Check>
              <Check ok={onLinkedAccount}>
                {onLinkedAccount
                  ? 'MetaMask is on your verified account'
                  : isConnected
                    ? `Switch MetaMask to your verified account ${shortenAddress(linkedWallet)}`
                    : 'Connect MetaMask'}
              </Check>
              <Check ok={onTargetChain}>{onTargetChain ? `Connected to ${target.name}` : `Switch to ${target.name}`}</Check>
            </ul>
          )}

          {busy && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-ink-800 p-3 text-sm">
              <Spinner size="sm" className="mt-0.5 text-brand-300" />
              <div className="min-w-0">
                <p className="text-white">
                  {step === 'signing' && 'Confirm the transaction in MetaMask…'}
                  {step === 'pending' && 'Transaction sent. Waiting for it to be mined…'}
                  {step === 'verifying' && 'Mined. Verifying the mint on-chain…'}
                </p>
                {tx && (
                  <p className="mt-1 truncate font-mono text-xs text-slate-400" title={tx.hash}>
                    {tx.hash}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'resumable' && tx && (
            <div className="mt-4 rounded-xl bg-ink-800 p-3 text-sm">
              <p className="text-white">A mint transaction was sent for this artwork.</p>
              <p className="mt-1 truncate font-mono text-xs text-slate-400" title={tx.hash}>
                {tx.hash}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Check its status to finish recording it. Don't mint again unless it failed.
              </p>
            </div>
          )}

          <Alert className="mt-4">{error}</Alert>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {step === 'resumable' ? (
              <>
                <Button type="button" onClick={checkStatus}>
                  Check status
                </Button>
                {canRemint && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setStep('idle')
                      setTx(null)
                      setError('')
                      setCanRemint(false)
                    }}
                  >
                    Mint again
                  </Button>
                )}
              </>
            ) : !isMetaMaskInstalled ? (
              <p className="text-sm text-slate-400">Install MetaMask to mint.</p>
            ) : !isConnected ? (
              <Button type="button" onClick={connect}>
                Connect wallet
              </Button>
            ) : linkedWallet && !onLinkedAccount ? (
              <p className="text-xs text-amber-200">Select your verified account in MetaMask to continue.</p>
            ) : !onTargetChain ? (
              <Button
                type="button"
                variant="secondary"
                loading={switchingTo === target.chainId}
                onClick={() => switchNetwork(target.chainId)}
              >
                Switch to {target.name}
              </Button>
            ) : (
              <Button type="button" onClick={mint} loading={busy} disabled={!ready || busy}>
                {busy ? 'Minting…' : 'Mint NFT'}
              </Button>
            )}
            {explorer && (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-300 hover:text-brand-200"
              >
                View transaction
              </a>
            )}
          </div>
        </>
      )}
    </section>
  )
}
