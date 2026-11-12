import { useEffect, useState } from 'react'
import { useQuery } from '../../hooks/useQuery'
import { getGeneration, getIpfsStatus, publishToIpfs } from '../../services/ai.service'
import { parseApiError } from '../../services/api'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import CopyButton from '../ui/CopyButton'
import Spinner from '../ui/Spinner'

const shortCid = (cid) => (cid ? `${cid.slice(0, 10)}…${cid.slice(-6)}` : '')

function StepRow({ index, label, cid, gatewayUrl, state }) {
  const icon = {
    done: <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-xs text-emerald-300">✓</span>,
    failed: <span className="grid h-6 w-6 place-items-center rounded-full bg-red-500/20 text-xs text-red-300">!</span>,
    running: <Spinner size="sm" className="m-1 text-brand-300" />,
    pending: (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-white/5 text-xs text-slate-500">{index}</span>
    ),
  }[state]

  return (
    <li className="flex items-center gap-3 py-2">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-white">{label}</p>
        {cid ? (
          <p className="truncate font-mono text-xs text-slate-400" title={cid}>
            {shortCid(cid)}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {state === 'failed' ? 'Failed. Retry will continue from here.' : state === 'running' ? 'Uploading…' : 'Not uploaded yet'}
          </p>
        )}
      </div>
      {cid && gatewayUrl && (
        <a
          href={gatewayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-brand-300 hover:bg-white/5 hover:text-brand-200"
        >
          View
        </a>
      )}
    </li>
  )
}

/**
 * Shows IPFS publishing progress for one artwork and starts / retries it.
 * The server saves each step as it succeeds, so "Retry" never re-uploads
 * a step that already worked.
 */
export default function IpfsPanel({ artwork, onUpdated, blockedReason = '' }) {
  const status = useQuery('ipfs-status', getIpfsStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [seconds, setSeconds] = useState(0)

  const ipfs = artwork.ipfs ?? { status: 'NOT_STARTED' }
  const complete = ipfs.status === 'COMPLETE'
  const failed = ipfs.status === 'FAILED'
  const startedBefore = Boolean(ipfs.imageCid) || failed
  const running = busy || ipfs.inProgress

  useEffect(() => {
    if (!busy) return
    const started = Date.now()
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(t)
  }, [busy])

  const run = async () => {
    setConfirmOpen(false)
    setError('')
    setSeconds(0)
    setBusy(true)
    try {
      onUpdated(await publishToIpfs(artwork.id))
    } catch (err) {
      setError(parseApiError(err).message)
      // Reload so the panel shows exactly which steps were saved before the failure.
      try {
        onUpdated(await getGeneration(artwork.id))
      } catch {
        /* keep the current view */
      }
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    setError('')
    try {
      onUpdated(await getGeneration(artwork.id))
    } catch (err) {
      setError(parseApiError(err).message)
    }
  }

  const imageState = ipfs.imageCid ? 'done' : running ? 'running' : ipfs.failedStep === 'IMAGE' ? 'failed' : 'pending'
  const metadataState = ipfs.metadataCid
    ? 'done'
    : running && ipfs.imageCid
      ? 'running'
      : ipfs.failedStep === 'METADATA'
        ? 'failed'
        : 'pending'

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">IPFS storage</h2>
        {complete && <span className="text-xs font-medium text-emerald-300">Ready to mint</span>}
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Your image and its metadata are stored on IPFS, so the NFT points to content that can't be changed later.
      </p>

      <ol className="mt-3 divide-y divide-white/5">
        <StepRow index={1} label="Image" cid={ipfs.imageCid} gatewayUrl={ipfs.imageGatewayUrl} state={imageState} />
        <StepRow
          index={2}
          label="Metadata (name, description, traits)"
          cid={ipfs.metadataCid}
          gatewayUrl={ipfs.metadataGatewayUrl}
          state={metadataState}
        />
      </ol>

      {complete && (
        <div className="mt-4 rounded-xl bg-ink-800 p-3">
          <p className="text-xs text-slate-400">Token URI (used when minting)</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-white" title={ipfs.metadataUri}>
              {ipfs.metadataUri}
            </code>
            <CopyButton value={ipfs.metadataUri} label="Copy token URI" />
          </div>
        </div>
      )}

      {!complete && failed && ipfs.lastError && !error && (
        <Alert className="mt-4">
          Upload stopped at the {ipfs.failedStep === 'IMAGE' ? 'image' : 'metadata'} step: {ipfs.lastError}
        </Alert>
      )}
      <Alert className="mt-4">{error}</Alert>

      {!complete && (
        <div className="mt-4 space-y-2">
          {status.loading ? null : !status.data?.configured ? (
            <p className="text-xs text-slate-400">
              IPFS uploads are not available{status.data?.reason ? `: ${status.data.reason}` : '.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => (startedBefore ? run() : setConfirmOpen(true))}
                  loading={busy}
                  disabled={running || Boolean(blockedReason)}
                >
                  {busy ? `Uploading… ${seconds}s` : startedBefore ? 'Retry upload' : 'Upload to IPFS'}
                </Button>
                {ipfs.inProgress && !busy && (
                  <Button type="button" variant="ghost" size="sm" onClick={refresh}>
                    Refresh status
                  </Button>
                )}
              </div>
              {blockedReason && !running && <p className="text-xs text-amber-200">{blockedReason}</p>}
              {startedBefore && !running && (
                <p className="text-xs text-slate-500">
                  Steps that already succeeded are kept. A retry continues from where it stopped, without uploading
                  anything twice.
                </p>
              )}
              {ipfs.inProgress && !busy && (
                <p className="text-xs text-slate-500">An upload is already running for this artwork.</p>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Upload to IPFS?"
        confirmLabel="Upload"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={run}
      >
        The image and its details will be stored publicly on IPFS. After this, the name, description and traits
        can't be changed, because the NFT will point to exactly this content.
      </ConfirmDialog>
    </section>
  )
}
