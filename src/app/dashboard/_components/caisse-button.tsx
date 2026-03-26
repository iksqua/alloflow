'use client'

export function CaisseButton() {
  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .caisse-dot { animation: blink 1.5s ease-in-out infinite; }
        .caisse-btn:hover { box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }
      `}</style>
      <button
        className="caisse-btn flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-semibold transition-all"
        onClick={() => window.open('/caisse/pos', '_blank')}
        title="S'ouvre dans un nouvel onglet — La caisse tourne en parallèle"
        style={{
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.4)',
          color: 'var(--green)',
        }}
      >
        <span
          className="caisse-dot w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: 'var(--green)' }}
        />
        Ouvrir la caisse
      </button>
    </>
  )
}
