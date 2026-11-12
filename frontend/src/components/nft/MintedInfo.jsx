import { useState } from 'react'
import { addressExplorerUrl, getNetworkByChainId, txExplorerUrl } from '../../config/networks'
import { useAuth } from '../../hooks/useAuth'
import { parseApiError } from '../../services/api'
import { verifyNftOwner } from '../../services/nft.service'
import { sameAddress, shortenAddress, toChecksumAddress } from '../../utils/format'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import CopyButton from '../ui/CopyButton'

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-sm text-white">{children}</dd>
    </div>
  )
}

/** On-chain details of a minted NFT, with a live ownership check. */
export default function MintedInfo({ nft, onUpdated }) {
  const { user } = useAuth()
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const network = getNetworkByChainId(nft.chainId)
  const txUrl = txExplorerUrl(nft.chainId, nft.transactionHash)
  const contractUrl = addressExplorerUrl(nft.chainId, nft.contractAddress)
  const youOwnIt = sameAddress(nft.ownerAddress, user?.walletAddress)

  const verify = async () => {
    setChecking(true)
    setMessage({ type: '', text: '' })
    try {
      const { nft: updated, changed } = await verifyNftOwner(nft.id)
      onUpdated?.(updated)
      setMessage({
        type: 'success',
        text: changed ? 'The owner changed on-chain; updated.' : 'Ownership confirmed on the blockchain.',
      })
    } catch (err) {
      setMessage({ type: 'error', text: parseApiError(err).message })
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">NFT</h2>
        <span className="text-xs font-medium text-emerald-300">Minted &amp; verified</span>
      </div>

      <dl className="mt-3">
        <Row label="Network">{network?.name ?? `Chain ${nft.chainId}`}</Row>
        <Row label="Token ID">#{nft.tokenId}</Row>
        <Row label="Contract">
          <span className="font-mono text-xs" title={toChecksumAddress(nft.contractAddress)}>
            {shortenAddress(toChecksumAddress(nft.contractAddress))}
          </span>
          <CopyButton value={toChecksumAddress(nft.contractAddress)} label="Copy contract address" />
          {contractUrl && (
            <a href={contractUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-300">
              View
            </a>
          )}
        </Row>
        <Row label="Owner">
          <span className="font-mono text-xs">{shortenAddress(toChecksumAddress(nft.ownerAddress))}</span>
          {youOwnIt && <span className="ml-1 rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300">you</span>}
        </Row>
        <Row label="Transaction">
          <span className="truncate font-mono text-xs" title={nft.transactionHash}>
            {shortenAddress(nft.transactionHash, 6)}
          </span>
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-300">
              View
            </a>
          )}
        </Row>
        <Row label="Token URI">
          <span className="truncate font-mono text-xs" title={nft.metadataURI}>
            {nft.metadataURI}
          </span>
          {nft.metadataGatewayUrl && (
            <a href={nft.metadataGatewayUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-300">
              View
            </a>
          )}
        </Row>
        <Row label="Image">
          <span className="truncate font-mono text-xs" title={nft.image}>
            {nft.image}
          </span>
          {nft.imageGatewayUrl && (
            <a href={nft.imageGatewayUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-300">
              View
            </a>
          )}
        </Row>
      </dl>

      <Alert type={message.type || 'info'} className="mt-3">
        {message.text}
      </Alert>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" to={`/nft/${nft.id}`}>
          Open NFT page (sell / transfer)
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={verify} loading={checking}>
          Verify ownership on-chain
        </Button>
      </div>
    </section>
  )
}
