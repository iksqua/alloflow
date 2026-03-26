'use client'

interface TopbarProps {
  title: string
  showCaisseButton?: boolean
}

export function Topbar({ title, showCaisseButton = true }: TopbarProps) {
  const openCaisse = () => {
    window.open('/caisse/pos', '_blank')
  }

  return (
    <header
      className="fixed top-0 right-0 h-12 flex items-center justify-between px-6 border-b border-[var(--border)] z-10"
      style={{ left: '220px', background: 'var(--bg)' }}
    >
      <h1 className="text-sm font-semibold text-[var(--text1)]">{title}</h1>
      <div className="flex items-center gap-3">
        {showCaisseButton && (
          <button
            onClick={openCaisse}
            title="S'ouvre dans un nouvel onglet — La caisse tourne en parallèle"
            className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90"
            style={{ background: 'var(--green)' }}
          >
            Ouvrir la caisse ↗
          </button>
        )}
      </div>
    </header>
  )
}
