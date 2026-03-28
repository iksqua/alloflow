'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Contract {
  royalty_rate:   number
  marketing_rate: number
  start_date:     string
}

interface Props {
  establishmentId: string
  initialContract: Contract
}

const inputStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text1)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '18px',
  fontWeight: 700,
  width: '80px',
  outline: 'none',
  textAlign: 'center' as const,
} as React.CSSProperties

const labelStyle = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text4)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  marginBottom: '5px',
}

export function FicheClient({ establishmentId, initialContract }: Props) {
  const router = useRouter()
  const [contract, setContract] = useState(initialContract)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/franchise/contracts/${establishmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          royalty_rate:   contract.royalty_rate,
          marketing_rate: contract.marketing_rate,
          start_date:     contract.start_date,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(typeof d.error === 'string' ? d.error : 'Erreur')
      }
      const { contract: updated } = await res.json()
      setContract(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  // Live projection (use actual contract CA month if available — here showing with 15k estimate)
  const estimatedCA = 15000
  const projRoyalty   = Math.round(estimatedCA * contract.royalty_rate)   / 100
  const projMarketing = Math.round(estimatedCA * contract.marketing_rate) / 100
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard/franchise/franchises')}
          className="text-sm text-[var(--text4)] hover:text-[var(--text2)] transition-colors"
        >
          ← Retour
        </button>
        <h1 className="text-xl font-semibold text-[var(--text1)]">Contrat franchisé</h1>
      </div>

      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-col gap-5">
          {/* Rates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Redevance royalties</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={50} step={0.5}
                  style={inputStyle}
                  value={contract.royalty_rate}
                  onChange={e => setContract(prev => ({ ...prev, royalty_rate: parseFloat(e.target.value) || 0 }))}
                />
                <span className="text-sm text-[var(--text3)]">% du CA HT</span>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Fonds marketing</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={20} step={0.5}
                  style={inputStyle}
                  value={contract.marketing_rate}
                  onChange={e => setContract(prev => ({ ...prev, marketing_rate: parseFloat(e.target.value) || 0 }))}
                />
                <span className="text-sm text-[var(--text3)]">% du CA HT</span>
              </div>
            </div>
          </div>

          {/* Start date */}
          <div>
            <label style={labelStyle}>Date de démarrage</label>
            <input
              type="date"
              style={{ ...inputStyle, width: 'auto', fontSize: '14px', fontWeight: 400, textAlign: 'left' as const }}
              value={contract.start_date}
              onChange={e => setContract(prev => ({ ...prev, start_date: e.target.value }))}
            />
          </div>

          {/* Projection */}
          <div
            className="rounded-lg p-3"
            style={{ background: '#0f1f10', border: '1px solid #1a3a1a' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4a7a4a' }}>
              Projection mois en cours (CA estimé {fmt(estimatedCA)})
            </p>
            <div className="flex gap-6 items-end">
              <div>
                <p className="text-xs text-[var(--text4)]">Royalties</p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(projRoyalty)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text4)]">Marketing</p>
                <p className="text-sm font-bold" style={{ color: '#4ade80' }}>{fmt(projMarketing)}</p>
              </div>
              <div className="pl-4" style={{ borderLeft: '1px solid #1a3a1a' }}>
                <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>TOTAL →</p>
                <p className="text-base font-bold" style={{ color: '#60a5fa' }}>{fmt(projRoyalty + projMarketing)}</p>
              </div>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-all"
              style={{
                background: saved ? 'var(--green)' : 'var(--blue)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
