import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AiSuggestPanel from '../components/artwork/AiSuggestPanel'
import AttributesEditor from '../components/artwork/AttributesEditor'
import ImageDropzone from '../components/artwork/ImageDropzone'
import IpfsPanel from '../components/artwork/IpfsPanel'
import MintedInfo from '../components/nft/MintedInfo'
import MintPanel from '../components/nft/MintPanel'
import StatusBadge from '../components/artwork/StatusBadge'
import Alert from '../components/ui/Alert'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import FormField from '../components/ui/FormField'
import PageLoader from '../components/ui/PageLoader'
import { ART_STYLES } from '../config/artStyles'
import { useQuery } from '../hooks/useQuery'
import { createGeneration, deleteGeneration, getGeneration, updateGeneration } from '../services/ai.service'
import { parseApiError } from '../services/api'
import { assetUrl } from '../utils/assets'
import { cleanAttributes, validateAttributes } from '../utils/attributes'

const EMPTY = {
  name: '',
  description: '',
  collectionName: '',
  style: 'none',
  attributes: [],
  prompt: '',
  aiSuggested: false,
}

function toForm(artwork) {
  if (!artwork) return EMPTY
  return {
    name: artwork.name ?? '',
    description: artwork.description ?? '',
    collectionName: artwork.collectionName ?? '',
    style: artwork.style ?? 'none',
    attributes: artwork.attributes ?? [],
    prompt: artwork.prompt ?? '',
    aiSuggested: Boolean(artwork.aiSuggested),
  }
}

/** Create (no id) or edit (with id) an artwork draft. */
export default function StudioPage() {
  const { id } = useParams()
  const { data, error, loading } = useQuery(id ?? null, () => getGeneration(id))

  if (!id) return <ArtworkForm key="new" />
  if (loading) return <PageLoader label="Loading artwork…" />
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <Alert>{error}</Alert>
        <Button className="mt-6" variant="secondary" to="/artwork">
          Back to my artwork
        </Button>
      </div>
    )
  }
  // Keyed by id so the form re-initialises when switching between artworks.
  return <ArtworkForm key={id} artwork={data} />
}

function ArtworkForm({ artwork: initialArtwork }) {
  const navigate = useNavigate()
  // Kept in state so IPFS progress and saved edits update the page in place.
  const [artwork, setArtwork] = useState(initialArtwork ?? null)
  const isEdit = Boolean(artwork)
  // Details are locked once pinned to IPFS (the NFT points at that exact content),
  // while an upload is running, and after minting.
  const isLocked = Boolean(artwork) && (artwork.status !== 'DRAFT' || Boolean(artwork.ipfs?.inProgress))

  const [image, setImage] = useState(null) // { file, url, width, height } for new uploads
  const [form, setForm] = useState(() => toForm(artwork))
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const setField = (name, value) => {
    setForm((f) => ({ ...f, [name]: value }))
    setFieldErrors((fe) => ({ ...fe, [name]: undefined }))
    setNotice('')
  }
  const onInput = (e) => setField(e.target.name, e.target.value)

  // IPFS metadata is built from the SAVED details, so unsaved edits must be saved first.
  const hasUnsavedChanges = isEdit && JSON.stringify(form) !== JSON.stringify(toForm(artwork))

  const applySuggestion = (s) => {
    setForm((f) => ({
      ...f,
      name: s.name,
      description: s.description,
      collectionName: s.collectionName || f.collectionName,
      attributes: s.attributes.length ? s.attributes : f.attributes,
      aiSuggested: true,
    }))
    setFieldErrors({})
    setNotice('AI suggestion applied. Review and edit it, then save.')
  }

  const validate = () => {
    const errors = {}
    if (!isEdit && !image) errors.image = 'Choose an image to upload.'
    if (!form.name.trim()) errors.name = 'Give your artwork a name.'
    const attrError = validateAttributes(form.attributes)
    if (attrError) errors.attributes = attrError
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!validate()) return

    const details = {
      name: form.name.trim(),
      description: form.description.trim(),
      collectionName: form.collectionName.trim(),
      style: form.style,
      attributes: cleanAttributes(form.attributes),
      prompt: form.prompt.trim(),
      aiSuggested: form.aiSuggested,
    }

    setSaving(true)
    try {
      if (isEdit) {
        const updated = await updateGeneration(artwork.id, details)
        setArtwork(updated)
        setForm(toForm(updated))
        setNotice('Changes saved.')
      } else {
        setProgress(0)
        await createGeneration({ file: image.file, details }, { onProgress: setProgress })
        navigate('/artwork', { state: { flash: 'Artwork saved to your library.' } })
        return
      }
    } catch (err) {
      const { message, fieldErrors: fe } = parseApiError(err)
      setError(message)
      setFieldErrors((prev) => ({ ...prev, ...fe }))
    }
    setSaving(false)
  }

  const onDelete = async () => {
    setDeleting(true)
    try {
      await deleteGeneration(artwork.id)
      navigate('/artwork', { state: { flash: 'Artwork deleted.' } })
    } catch (err) {
      setError(parseApiError(err).message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/artwork" className="text-sm text-slate-400 hover:text-white">
            ← My artwork
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{isEdit ? 'Edit artwork' : 'Create artwork'}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isEdit
              ? 'Update the details you will mint this artwork with.'
              : 'Upload your artwork and describe it. You can mint it later.'}
          </p>
        </div>
        {isEdit && <StatusBadge status={artwork.status} className="self-start sm:self-auto" />}
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* --- Image */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Artwork</h2>
          {isEdit ? (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-800">
              <img
                src={assetUrl(artwork.generatedImage)}
                alt={artwork.name || 'Artwork'}
                className="mx-auto max-h-[480px] w-full object-contain"
              />
            </div>
          ) : (
            <ImageDropzone
              value={image}
              onChange={(img) => {
                setImage(img)
                setFieldErrors((fe) => ({ ...fe, image: undefined }))
              }}
              disabled={saving}
            />
          )}
          {fieldErrors.image && <p className="mt-2 text-sm text-red-300">{fieldErrors.image}</p>}
          {isEdit && (
            <p className="mt-3 text-xs text-slate-500">
              {artwork.image.width}×{artwork.image.height} · {artwork.image.mimeType.replace('image/', '').toUpperCase()}
              {' · '}The image can't be changed. Create a new artwork to use a different image.
            </p>
          )}
        </section>

        {/* --- Details */}
        <section className="card space-y-5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Details</h2>

          {isLocked && (
            <Alert type="info">
              {artwork.status === 'MINTED'
                ? 'This artwork has been minted, so its details can no longer change.'
                : artwork.ipfs?.inProgress
                  ? 'This artwork is being uploaded to IPFS. Details are locked until it finishes.'
                  : 'This artwork is on IPFS, so its details are locked: the NFT will point to exactly this content.'}
            </Alert>
          )}

          {!isLocked && (
            <AiSuggestPanel
              prompt={form.prompt}
              onPromptChange={(value) => setField('prompt', value)}
              style={form.style}
              onApply={applySuggestion}
              disabled={saving}
            />
          )}

          <fieldset disabled={saving || isLocked} className="space-y-5">
            <FormField
              label="Name"
              name="name"
              value={form.name}
              onChange={onInput}
              maxLength={60}
              placeholder="e.g. Neon Skyline"
              error={fieldErrors.name}
            />
            <FormField
              label="Description"
              name="description"
              multiline
              value={form.description}
              onChange={onInput}
              maxLength={1000}
              placeholder="What does this artwork show? What inspired it?"
              hint={`${form.description.length}/1000`}
              error={fieldErrors.description}
            />
            <FormField
              label="Collection name"
              name="collectionName"
              value={form.collectionName}
              onChange={onInput}
              maxLength={60}
              placeholder="Optional, e.g. Electric Dreams"
              hint="Full collections come in a later phase. This name is kept for now."
              error={fieldErrors.collectionName}
            />

            <div>
              <label htmlFor="style" className="mb-1.5 block text-sm font-medium text-slate-300">
                Style
              </label>
              <select
                id="style"
                name="style"
                value={form.style}
                onChange={onInput}
                className="w-full rounded-xl border border-white/10 bg-ink-800 px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                {ART_STYLES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <AttributesEditor
              value={form.attributes}
              onChange={(attrs) => setField('attributes', attrs)}
              error={fieldErrors.attributes}
            />
          </fieldset>

          <Alert>{error}</Alert>
          <Alert type="success">{notice}</Alert>

          {!isLocked && (
            <div className="flex flex-col-reverse gap-2 border-t border-white/5 pt-5 sm:flex-row sm:justify-between">
              {isEdit ? (
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={saving}>
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" loading={saving}>
                {saving && !isEdit ? (progress < 100 ? `Uploading ${progress}%` : 'Saving…') : isEdit ? 'Save changes' : 'Save artwork'}
              </Button>
            </div>
          )}
        </section>
      </form>

      {isEdit && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <IpfsPanel
            artwork={artwork}
            onUpdated={(updated) => {
              // Keep an already-loaded NFT (the IPFS endpoint returns it unpopulated).
              setArtwork((prev) => ({ ...updated, nft: prev?.nft ?? updated.nft }))
              setForm(toForm(updated))
            }}
            blockedReason={
              hasUnsavedChanges
                ? 'Save your changes first: IPFS uses the saved details.'
                : !artwork.name?.trim()
                  ? 'Give your artwork a name and save it first.'
                  : ''
            }
          />

          {artwork.status === 'UPLOADED_TO_IPFS' && (
            <MintPanel
              artwork={artwork}
              onMinted={(nft, generation) => setArtwork({ ...generation, nft })}
            />
          )}

          {artwork.status === 'MINTED' && artwork.nft && typeof artwork.nft === 'object' && (
            <MintedInfo nft={artwork.nft} onUpdated={(nft) => setArtwork((prev) => ({ ...prev, nft }))} />
          )}
        </div>
      )}

      {isEdit && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this artwork?"
          confirmLabel="Delete"
          variant="danger"
          loading={deleting}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={onDelete}
        >
          "{artwork.name || 'Untitled'}" and its image will be permanently removed from your library.
        </ConfirmDialog>
      )}
    </div>
  )
}
