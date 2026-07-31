import { useRef, useState } from 'react'
import './MediaAttachment.css'

export type SelectedMedia = {
  base64: string
  mimeType: string
  fileName: string
  sizeBytes: number
  previewUrl: string | null
}

type MediaAttachmentProps = {
  onChange: (media: SelectedMedia | null) => void
  disabled?: boolean
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024
const ACCEPTED_TYPES = 'image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaAttachment({ onChange, disabled }: MediaAttachmentProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [media, setMedia] = useState<SelectedMedia | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = (file: File) => {
    setError(null)

    if (file.size > MAX_SIZE_BYTES) {
      setError('Arquivo excede o limite de 20MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const base64 = result.substring(result.indexOf(',') + 1)
      const isImage = file.type.startsWith('image/')

      const next: SelectedMedia = {
        base64,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
        sizeBytes: file.size,
        previewUrl: isImage ? result : null,
      }

      setMedia(next)
      onChange(next)
    }
    reader.onerror = () => setError('Falha ao ler o arquivo.')
    reader.readAsDataURL(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleRemove = () => {
    setMedia(null)
    setError(null)
    onChange(null)
  }

  return (
    <div className="media-attachment">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleInputChange}
        disabled={disabled}
        hidden
      />

      {!media ? (
        <button
          type="button"
          className="media-attachment-trigger"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          title="Anexar imagem, vídeo ou documento"
        >
          📎 Anexar mídia
        </button>
      ) : (
        <div className="media-attachment-preview">
          {media.previewUrl ? (
            <img src={media.previewUrl} alt={media.fileName} className="media-attachment-thumb" />
          ) : (
            <div className="media-attachment-icon">📄</div>
          )}
          <div className="media-attachment-info">
            <strong>{media.fileName}</strong>
            <small>{formatSize(media.sizeBytes)}</small>
          </div>
          <button
            type="button"
            className="media-attachment-remove"
            onClick={handleRemove}
            disabled={disabled}
            title="Remover anexo"
          >
            ✕
          </button>
        </div>
      )}

      {error && <div className="media-attachment-error">{error}</div>}
    </div>
  )
}
