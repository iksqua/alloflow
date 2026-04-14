'use client'
import { useState } from 'react'

interface Table {
  id: string
  name: string
  seats: number
}

interface Props {
  initialTables: Table[]
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)',
  color: 'var(--text1)', borderRadius: '8px', padding: '8px 12px',
  fontSize: '14px', outline: 'none',
}

export function TablesManager({ initialTables }: Props) {
  const [tables, setTables]   = useState<Table[]>(initialTables)
  const [newName, setNewName] = useState('')
  const [newSeats, setNewSeats] = useState(4)
  const [adding,  setAdding]  = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), seats: newSeats }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erreur')
      }
      const { table } = await res.json()
      setTables(prev => [...prev, table].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setNewSeats(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/tables/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erreur')
      }
      setTables(prev => prev.filter(t => t.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la suppression')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-[var(--text1)] mb-0.5">Tables</p>
        <p className="text-xs text-[var(--text3)]">Gérez les tables affichées dans le plan de salle de la caisse</p>
      </div>

      {tables.length > 0 && (
        <div className="flex flex-col gap-1">
          {tables.map(table => (
            <div
              key={table.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
              style={{ background: 'var(--surface2)' }}
            >
              <span className="text-sm text-[var(--text1)]">{table.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text3)]">{table.seats} places</span>
                <button
                  onClick={() => handleDelete(table.id)}
                  disabled={deleting === table.id}
                  className="text-xs px-2 py-1 rounded text-[var(--red)] hover:bg-red-900/20 transition-colors disabled:opacity-40"
                >
                  {deleting === table.id ? '…' : 'Supprimer'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tables.length === 0 && (
        <p className="text-sm text-[var(--text4)] py-2">Aucune table configurée</p>
      )}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-[var(--text3)] mb-1">Nom de la table</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Table 1, Bar, Terrasse…"
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text3)] mb-1">Places</label>
          <input
            type="number" min={1} max={20}
            value={newSeats}
            onChange={e => setNewSeats(parseInt(e.target.value, 10) || 4)}
            style={{ ...inputStyle, width: '72px' }}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
          style={{ background: 'var(--blue)', opacity: adding || !newName.trim() ? 0.5 : 1 }}
        >
          {adding ? '…' : '+ Ajouter'}
        </button>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}
