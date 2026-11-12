import { txExplorerUrl } from '../../config/networks'
import Spinner from '../ui/Spinner'

const LABELS = {
  approving: 'Approve the marketplace in MetaMask (one-time per NFT)…',
  signing: 'Confirm the transaction in MetaMask…',
  pending: 'Transaction sent. Waiting for it to be mined…',
  verifying: 'Mined. Verifying it on-chain…',
}

/** Live status line for a running wallet transaction. */
export default function TxProgress({ status, chainId }) {
  if (!status || !LABELS[status.step]) return null
  const explorer = status.hash ? txExplorerUrl(chainId, status.hash) : null
  return (
    <div className="flex items-start gap-3 rounded-xl bg-ink-800 p-3 text-sm" role="status">
      <Spinner size="sm" className="mt-0.5 text-brand-300" />
      <div className="min-w-0">
        <p className="text-white">{LABELS[status.step]}</p>
        {status.hash && (
          <p className="mt-1 truncate font-mono text-xs text-slate-400" title={status.hash}>
            {explorer ? (
              <a href={explorer} target="_blank" rel="noopener noreferrer" className="hover:text-brand-300">
                {status.hash}
              </a>
            ) : (
              status.hash
            )}
          </p>
        )}
      </div>
    </div>
  )
}
