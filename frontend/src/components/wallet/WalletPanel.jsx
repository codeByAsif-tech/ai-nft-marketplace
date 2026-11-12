import { useState } from 'react'
import { useWallet } from '../../hooks/useWallet'
import { useWalletLink } from '../../hooks/useWalletLink'
import { METAMASK_DOWNLOAD_URL } from '../../utils/constants'
import { shortenAddress, toChecksumAddress } from '../../utils/format'
import Alert from '../ui/Alert'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import CopyButton from '../ui/CopyButton'
import BalanceDisplay from './BalanceDisplay'
import NetworkBadge from './NetworkBadge'
import NetworkSelector from './NetworkSelector'

const STEP_LABEL = {
  requesting: 'Preparing…',
  signing: 'Sign in MetaMask…',
  verifying: 'Verifying…',
}

function VerificationBadge({ state }) {
  const styles = {
    verified: 'bg-emerald-500/15 text-emerald-300',
    mismatch: 'bg-amber-500/15 text-amber-300',
    none: 'bg-white/5 text-slate-400',
  }
  const labels = { verified: 'Verified', mismatch: 'Different wallet', none: 'Not linked' }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[state]}`}>{labels[state]}</span>
}

/** Dashboard card: connection, network, balance and account verification. */
export default function WalletPanel() {
  const wallet = useWallet()
  const linkState = useWalletLink()
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  const { isMetaMaskInstalled, isConnected, isConnecting, account, isSupportedNetwork, error, connect } = wallet
  const { linkedAddress, isLinked, isCurrentAccountLinked, step, busy, link, unlink } = linkState

  const verification = !isLinked ? 'none' : isConnected && !isCurrentAccountLinked ? 'mismatch' : 'verified'

  return (
    <section className="card flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Wallet</h2>
        {isConnected && <NetworkBadge />}
      </div>

      {/* --- Connection */}
      {!isMetaMaskInstalled ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            MetaMask is required to mint and trade NFTs. Install the browser extension, then reload this page.
          </p>
          <Button
            variant="secondary"
            onClick={() => window.open(METAMASK_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')}
          >
            Install MetaMask
          </Button>
        </div>
      ) : !isConnected ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Connect MetaMask to see your balance and verify your wallet. Your private keys always stay in MetaMask.
          </p>
          <Alert>{error}</Alert>
          <Button onClick={connect} loading={isConnecting}>
            {isConnecting ? 'Check MetaMask…' : 'Connect wallet'}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-ink-800 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Connected account</p>
              <p className="truncate font-mono text-sm text-white" title={account}>
                {shortenAddress(account, 6)}
              </p>
            </div>
            <CopyButton value={account} label="Copy address" />
          </div>

          <div className="rounded-xl bg-ink-800 px-3 py-3">
            <BalanceDisplay size="lg" />
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">Switch network</p>
            <NetworkSelector />
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          </div>
        </>
      )}

      {/* --- Account verification */}
      <div className="border-t border-white/5 pt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white">Account verification</p>
          <VerificationBadge state={verification} />
        </div>

        {isLinked && (
          <p className="mt-2 break-all font-mono text-xs text-slate-400">
            Linked: {toChecksumAddress(linkedAddress)}
          </p>
        )}

        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {verification === 'mismatch'
            ? 'The connected MetaMask account is not the wallet linked to your profile. Switch accounts in MetaMask, or verify this one to replace it.'
            : verification === 'none'
              ? 'Prove you own this wallet by signing a free message. No transaction, no gas.'
              : 'Your wallet ownership is verified by signature.'}
        </p>

        <div className="mt-3 space-y-3">
          <Alert>{linkState.error}</Alert>
          <Alert type="success">{linkState.success}</Alert>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {isConnected && !isCurrentAccountLinked && (
            <Button
              size="sm"
              onClick={link}
              loading={['requesting', 'signing', 'verifying'].includes(step)}
              disabled={busy || !isSupportedNetwork}
              title={!isSupportedNetwork ? 'Switch to a supported network first' : undefined}
            >
              {STEP_LABEL[step] || (isLinked ? 'Verify & replace wallet' : 'Verify & link wallet')}
            </Button>
          )}
          {isLinked && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmUnlink(true)} disabled={busy}>
              Unlink wallet
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmUnlink}
        title="Unlink wallet?"
        confirmLabel="Unlink"
        variant="danger"
        loading={step === 'unlinking'}
        onCancel={() => setConfirmUnlink(false)}
        onConfirm={async () => {
          await unlink()
          setConfirmUnlink(false)
        }}
      >
        {toChecksumAddress(linkedAddress)} will no longer be associated with your account. Nothing changes on the
        blockchain, and you can verify a wallet again at any time.
      </ConfirmDialog>
    </section>
  )
}
