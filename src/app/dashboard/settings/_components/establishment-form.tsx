'use client'
import { useState } from 'react'

interface Props {
  initialName: string
  initialSiret: string
  initialAddress: string
  initialTimezone: string
}

const TIMEZONES = [
  'Europe/Paris', 'Europe/Brussels', 'Europe/Luxembourg',
  'Europe/Zurich', 'Africa/Casablanca', 'Africa/Tunis',
]

export function EstablishmentForm({ initialName, initialSiret, initialAddress, initialTimezone }: Props) {
  const [name,     setName]     = useState(initialName)
  const [siret,    setSiret]    = useState(initialSiret)
  const [address,  setAddress]  = useState(initialAddress)
  const [timezone, setTimezone] = useState(initialTimezone || 'Europe/Paris')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/settings/establishment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, siret, address, timezone }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error?.message ?? 'Erreur')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text1)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '14px', width: '100%', outline: 'none',
  } as React.CSSProperties

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 500,
    color: 'var(--text3)', marginBottom: '6px',
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label style={labelStyle}>Nom de l&apos;établissement *</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} maxLength={80} />
      </div>
      <div>
        <label style={labelStyle}>SIRET (optionnel)</label>
        <input style={inputStyle} value={siret} onChange={e => setSiret(e.target.value)} placeholder="14 chiffres" maxLength={14} />
      </div>
      <div>
        <label style={labelStyle}>Adresse (optionnel)</label>
        <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} maxLength={200} />
      </div>
      <div>
        <label style={labelStyle}>Fuseau horaire *</label>
        <select style={inputStyle} value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="self-end px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
        style={{ background: 'var(--blue)', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
    </div>
  )
}
