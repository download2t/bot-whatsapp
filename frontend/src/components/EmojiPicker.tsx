import { useEffect, useRef, useState } from 'react'
import './EmojiPicker.css'

type EmojiPickerProps = {
  onSelect: (emoji: string) => void
  disabled?: boolean
}

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Carinhas',
    emojis: ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😉', '😎', '🤩', '😇', '🙂', '😅', '😢', '😭', '😡', '😱', '🤔', '🙄', '😴', '🥳', '😷', '🤗', '😬', '😳', '🥺', '😜', '😏', '🤤', '😌'],
  },
  {
    label: 'Gestos',
    emojis: ['👍', '👎', '👋', '🙏', '👏', '💪', '✌️', '🤝', '🤞', '👌', '🤙', '✋', '👆', '👇', '👉', '👈', '💅', '🙌', '🤲', '🖐️'],
  },
  {
    label: 'Corações',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💖', '💗', '💓', '💞', '😻', '💯'],
  },
  {
    label: 'Objetos',
    emojis: ['🎉', '🎁', '📅', '📌', '📎', '📞', '📱', '💻', '✅', '❌', '⚠️', '⭐', '🔥', '💡', '📢', '🛒', '💰', '🏆', '🕒', '📍'],
  },
  {
    label: 'Símbolos',
    emojis: ['✔️', '➡️', '⬅️', '🔁', '🔔', '🚀', '🌟', '☀️', '🌧️', '❄️', '🎯', '📈', '📉', '🔒', '🔓'],
  },
]

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="emoji-picker" ref={containerRef}>
      <button
        type="button"
        className="emoji-picker-trigger"
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled}
        title="Inserir emoji"
      >
        😀
      </button>

      {isOpen && (
        <div className="emoji-picker-panel">
          {EMOJI_CATEGORIES.map((category) => (
            <div key={category.label} className="emoji-picker-category">
              <span className="emoji-picker-category-label">{category.label}</span>
              <div className="emoji-picker-grid">
                {category.emojis.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    className="emoji-picker-item"
                    onClick={() => onSelect(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
