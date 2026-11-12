import { Contract, formatEther, parseEther } from 'ethers'
import { useState } from 'react'
import { getNetworkByChainId } from '../../config/networks'
import { NFT_COLLECTION_ABI } from '../../contracts/nftCollection'
import { NFT_MARKETPLACE_ABI } from '../../contracts/nftMarketplace'
import { useAuth } from '../../hooks/useAuth'
import { useWallet } from '../../hooks/useWallet'
import { recordCancel, recordListing, recordPurchase, recordTransfer } from '../../services/marketplace.service'
import { assertChain, assertContract, describeActionError, runChainAction } from '../../utils/chainAction'
import { formatEth, sameAddress, shortenAddress } from '../../utils/format'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import TransferDialog from './TransferDialog'
import TxProgress from './TxProgress'
import WalletGate from './WalletGate'

const PRICE_PATTERN = /^\d+(\.\d{1,18})?$/
const MAX_PRICE_ETH = 1_000_000

function validatePrice(value) {
  const v = value.trim()
  if (!v) return 'Enter a price.'
  if (!PRICE_PATTERN.test(v)) return 'Use a number like 0.05 (up to 18 decimals).'
  if (Number(v) <= 0) return 'The price must be more than 0.'
  if (Number(v) > MAX_PRICE_ETH) return `The price must be at most ${MAX_PRICE_ETH.toLocaleString()} ETH.`
  return ''
}

/**
 * Buy / list / cancel / transfer for one NFT, depending on who is viewing:
 *   - listed + viewer is the seller   -> Cancel listing
 *   - listed + anyone else            -> Buy now
 *   - not listed + viewer owns it      -> List for sale, Transfer
 * Every action is signed in MetaMask, then verified on-chain by the backend.
 * `marketNetwork` comes from GET /api/networks (has the contract addresses).
 */
export default function TradePanel({ nft, marketNetwork, onChanged }) {
  const { user } = useAuth()
  const { account, getSigner } = useWallet()
  const chain = getNetworkByChainId(nft.chainId)
  const marketAddress = marketNetwork?.marketplaceContract ?? null

  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [price, setPrice] = useState('')
  const [priceError, setPriceError] = useState('')
  const [confirmBuy, setConfirmBuy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const listing = nft.activeListing
  const wallet = user?.walletAddress
  const isSeller = Boolean(listing) && sameAddress(listing.sellerWallet, wallet)
  const isOwner = !listing && sameAddress(nft.ownerAddress, wallet)
  const busy = Boolean(status)

  /** Wraps an action with shared checks, status and error handling. */
  const run = async (fn, doneMessage) => {
    setError('')
    setSuccess('')
    try {
      const signer = await getSigner()
      await assertChain(signer, nft.chainId, chain?.name ?? 'the right network')
      await assertContract(signer, marketAddress, chain?.isLocal)
      await fn(signer)
      setSuccess(doneMessage)
      onChanged?.()
    } catch (err) {
      setError(describeActionError(err))
    } finally {
      setStatus(null)
    }
  }

  // ------------------------------------------------------------------ list
  const list = () => {
    const problem = validatePrice(price)
    setPriceError(problem)
    if (problem) return
    const value = parseEther(price.trim())

    run(async (signer) => {
      const nftContract = new Contract(nft.contractAddress, NFT_COLLECTION_ABI, signer)
      const market = new Contract(marketAddress, NFT_MARKETPLACE_ABI, signer)

      const owner = await nftContract.ownerOf(nft.tokenId)
      if (!sameAddress(owner, account)) throw new Error("This wallet doesn't own the NFT on-chain any more. Refresh the page.")

      // One-time approval so the marketplace can take the NFT into escrow.
      const approved = await nftContract.getApproved(nft.tokenId)
      const approvedForAll = await nftContract.isApprovedForAll(account, marketAddress)
      if (!sameAddress(approved, marketAddress) && !approvedForAll) {
        setStatus({ step: 'approving' })
        const approval = await nftContract.approve(marketAddress, nft.tokenId)
        setStatus({ step: 'approving', hash: approval.hash })
        await approval.wait(1)
      }

      await runChainAction({
        send: () => market.listItem(nft.contractAddress, nft.tokenId, value),
        record: (txHash) => recordListing({ nftId: nft.id, txHash }),
        onStatus: setStatus,
      })
      setPrice('')
    }, `Listed for ${price.trim()} ETH. Your NFT is now in marketplace escrow.`)
  }

  // ------------------------------------------------------------------- buy
  const buy = () => {
    setConfirmBuy(false)
    run(async (signer) => {
      const market = new Contract(marketAddress, NFT_MARKETPLACE_ABI, signer)

      // Re-check on-chain right before paying: prevents buying something already sold.
      const onChain = await market.getListing(listing.listingId)
      if (!onChain.active) {
        onChanged?.()
        throw new Error('This NFT was just sold or the listing was cancelled.')
      }
      if (onChain.price.toString() !== listing.price) {
        onChanged?.()
        throw new Error('The price on-chain differs from the page. Refresh and try again.')
      }
      const balance = await signer.provider.getBalance(account)
      if (balance < onChain.price) throw new Error('Not enough ETH in this wallet for the price plus the network fee.')

      await runChainAction({
        send: () => market.buyItem(listing.listingId, { value: onChain.price }),
        record: (txHash) => recordPurchase({ listingId: listing.id, txHash }),
        onStatus: setStatus,
      })
    }, 'Purchase complete. The NFT is now in your wallet.')
  }

  // ---------------------------------------------------------------- cancel
  const cancel = () => {
    setConfirmCancel(false)
    run(async (signer) => {
      const market = new Contract(marketAddress, NFT_MARKETPLACE_ABI, signer)
      await runChainAction({
        send: () => market.cancelListing(listing.listingId),
        record: (txHash) => recordCancel({ listingId: listing.id, txHash }),
        onStatus: setStatus,
      })
    }, 'Listing cancelled. The NFT is back in your wallet.')
  }

  // -------------------------------------------------------------- transfer
  const transfer = (to) => {
    setTransferOpen(false)
    run(async (signer) => {
      const nftContract = new Contract(nft.contractAddress, NFT_COLLECTION_ABI, signer)
      await runChainAction({
        send: () => nftContract['safeTransferFrom(address,address,uint256)'](account, to, nft.tokenId),
        record: (txHash) => recordTransfer({ nftId: nft.id, txHash }),
        onStatus: setStatus,
      })
    }, `Sent to ${shortenAddress(to)}.`)
  }

  if (!marketAddress) {
    return (
      <section className="card p-6">
        <Alert type="info">The marketplace isn’t configured for {chain?.name ?? 'this network'} yet.</Alert>
      </section>
    )
  }

  const priceEth = listing ? formatEth(formatEther(listing.price), 6) : null

  return (
    <section className="card p-6">
      {listing ? (
        <>
          <p className="text-sm text-slate-400">Current price</p>
          <p className="mt-1 font-display text-4xl font-semibold text-white">
            {priceEth} <span className="text-xl text-slate-400">ETH</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Listed by {isSeller ? 'you' : shortenAddress(listing.sellerWallet)} · held in marketplace escrow
          </p>
        </>
      ) : isOwner ? (
        <>
          <h2 className="text-lg font-semibold">You own this NFT</h2>
          <p className="mt-1 text-sm text-slate-400">List it for a fixed price, or send it to another wallet.</p>
        </>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Not for sale</h2>
          <p className="mt-1 text-sm text-slate-400">The owner hasn’t listed this NFT.</p>
        </>
      )}

      <div className="mt-5 space-y-3">
        <TxProgress status={status} chainId={nft.chainId} />
        <Alert>{error}</Alert>
        <Alert type="success">{success}</Alert>

        {(listing || isOwner) && (
          <WalletGate chainId={nft.chainId} networkName={chain?.name ?? 'the right network'}>
            {listing && isSeller && (
              <Button variant="secondary" className="w-full" onClick={() => setConfirmCancel(true)} loading={busy} disabled={busy}>
                Cancel listing
              </Button>
            )}

            {listing && !isSeller && (
              <Button className="w-full" size="lg" onClick={() => setConfirmBuy(true)} loading={busy} disabled={busy}>
                Buy now for {priceEth} ETH
              </Button>
            )}

            {isOwner && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="list-price" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Price
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        id="list-price"
                        inputMode="decimal"
                        value={price}
                        disabled={busy}
                        onChange={(e) => {
                          setPrice(e.target.value)
                          setPriceError('')
                        }}
                        placeholder="0.05"
                        className={`w-full rounded-xl border bg-ink-800 py-2.5 pl-3 pr-14 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                          priceError ? 'border-red-500/60 focus:ring-red-500/30' : 'border-white/10 focus:border-brand-500 focus:ring-brand-500/30'
                        }`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">ETH</span>
                    </div>
                    <Button onClick={list} loading={busy} disabled={busy}>
                      List for sale
                    </Button>
                  </div>
                  {priceError && <p className="mt-1.5 text-xs text-red-300">{priceError}</p>}
                  <p className="mt-1.5 text-xs text-slate-500">
                    First time: MetaMask asks you to approve the marketplace, then to list. The NFT moves into escrow
                    until it sells or you cancel.
                  </p>
                </div>
                <Button variant="ghost" className="w-full" onClick={() => setTransferOpen(true)} disabled={busy}>
                  Transfer to another wallet
                </Button>
              </div>
            )}
          </WalletGate>
        )}
      </div>

      <ConfirmDialog
        open={confirmBuy}
        title={`Buy “${nft.name}”?`}
        confirmLabel={`Pay ${priceEth} ETH`}
        onCancel={() => setConfirmBuy(false)}
        onConfirm={buy}
      >
        You’ll pay exactly {priceEth} ETH plus a small network fee on {chain?.name}. The NFT goes straight to your
        wallet. Purchases can’t be reversed.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this listing?"
        confirmLabel="Cancel listing"
        cancelLabel="Keep it listed"
        variant="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={cancel}
      >
        The NFT returns from escrow to your wallet and disappears from Explore. You can list it again later.
      </ConfirmDialog>

      <TransferDialog
        open={transferOpen}
        from={account}
        blocked={[marketAddress, nft.contractAddress]}
        nftName={nft.name}
        onCancel={() => setTransferOpen(false)}
        onConfirm={transfer}
      />
    </section>
  )
}
