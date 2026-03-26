'use client'

interface Table {
  id: string; name: string; seats?: number
  status: string
  current_order_id: string | null
}

interface FloorPlanModalProps {
  tables: Table[]
  onSelectTable: (tableId: string) => void
  onClose: () => void
}

export function FloorPlanModal({ tables, onSelectTable, onClose }: FloorPlanModalProps) {
  const STATUS_STYLES = {
    free: { bg: 'var(--green-bg)', border: 'var(--green)', text: 'var(--green)', label: 'Libre' },
    occupied: { bg: 'var(--amber-bg)', border: 'var(--amber)', text: 'var(--amber)', label: 'Occupée' },
    reserved: { bg: 'var(--blue-light)', border: 'var(--blue)', text: 'var(--blue)', label: 'Réservée' },
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[var(--text1)]">Plan de salle</h3>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        {/* Légende */}
        <div className="flex gap-4 mb-4 flex-shrink-0">
          {Object.entries(STATUS_STYLES).map(([status, style]) => (
            <div key={status} className="flex items-center gap-1.5 text-xs text-[var(--text3)]">
              <div className="w-3 h-3 rounded-sm" style={{ background: style.bg, border: `1px solid ${style.border}` }} />
              {style.label}
            </div>
          ))}
        </div>

        {/* Grille tables */}
        <div className="flex-1 overflow-y-auto">
          {tables.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl mb-3 block opacity-30">🪑</span>
              <p className="text-sm text-[var(--text4)]">Aucune table configurée</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {tables.map((table) => {
                const status = (table.status as 'free' | 'occupied' | 'reserved') in STATUS_STYLES
                  ? (table.status as 'free' | 'occupied' | 'reserved')
                  : 'free'
                const style = STATUS_STYLES[status]
                const isFree = status === 'free'
                return (
                  <button
                    key={table.id}
                    onClick={() => isFree && onSelectTable(table.id)}
                    disabled={!isFree}
                    className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 transition-all disabled:cursor-not-allowed"
                    style={{
                      background: style.bg,
                      borderColor: style.border,
                      opacity: isFree ? 1 : 0.7,
                    }}
                  >
                    <span className="text-2xl">🪑</span>
                    <span className="text-sm font-bold" style={{ color: style.text }}>{table.name}</span>
                    {table.seats && (
                      <span className="text-xs" style={{ color: style.text }}>{table.seats} pers.</span>
                    )}
                    <span className="text-xs font-medium" style={{ color: style.text }}>{style.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
