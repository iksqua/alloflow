'use client'

export function CaisseButton() {
  return (
    <button
      onClick={() => window.open('/caisse/pos', '_blank')}
      title="S'ouvre dans un nouvel onglet"
      className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-semibold text-white"
      style={{ background: 'var(--green)' }}
    >
      Ouvrir la caisse ↗
    </button>
  )
}
