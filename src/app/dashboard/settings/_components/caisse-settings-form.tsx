'use client'
import { useState } from 'react'

interface Props {
  initialOpeningFloat: number
  initialAutoPrint: boolean
  initialFooter: string
  initialTvaRate: number
}

export function CaisseSettingsForm({ initialOpeningFloat, initialAutoPrint, initialFooter, initialTvaRate }: Props) {
  const [openingFloat, setOpeningFloat] = useState(initialOpeningFloat)
  const [autoPrint,    setAutoPrint]    = useState(initialAutoPrint)
  const [footer,       setFooter]       = useState(initialFooter)
  const [tvaRate,      setTvaRate]      = useState(initialTvaRate)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/settings/caisse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_opening_float: openingFloat,
          auto_print_receipt: autoPrint,
          receipt_footer: footer,
          default_tva_rate: tvaRate,
        }),
      })
      if (!res.ok) throw new Error('Erreur')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text1)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '14px', outline: 'none',
  } as React.CSSProperties

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 500,
    color: 'var(--text3)', marginBottom: '6px',
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label style={labelStyle}>Fond de caisse par défaut (€)</label>
        <input
          type="number" min={0} max={9999} step={0.01}
          style={{ ...inputStyle, width: '140px' }}
          value={openingFloat}
          onChange={e => setOpeningFloat(parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setAutoPrint(!autoPrint)}
          className="relative flex-shrink-0 w-10 h-6 rounded-full transition-colors"
          style={{ background: autoPrint ? 'var(--blue)' : 'var(--surface2)', border: '1px solid var(--border)' }}
          role="switch"
          aria-checked={autoPrint}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full transition-transform"
            style={{
              background: 'white',
              transform: autoPrint ? 'translateX(16px)' : 'translateX(2px)',
            }}
          />
        </button>
        <span className="text-sm text-[var(--text2)]">Impression automatique du ticket</span>
      </div>

      <div>
        <label style={labelStyle}>Pied de ticket (max 160 caractères)</label>
        <textarea
          style={{ ...inputStyle, width: '100%', resize: 'vertical', minHeight: '70px' }}
          value={footer}
          onChange={e => setFooter(e.target.value)}
          maxLength={160}
          placeholder="Ex: Merci de votre visite !"
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text4)' }}>{footer.length}/160</p>
      </div>

      <div>
        <label style={labelStyle}>TVA par défaut</label>
        <div className="flex gap-2">
          {[5.5, 10, 20].map(rate => (
            <button
              key={rate}
              onClick={() => setTvaRate(rate)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={
                tvaRate === rate
                  ? { background: 'var(--blue)', color: 'white' }
                  : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }
              }
            >
              {rate}%
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-end px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
        style={{ background: 'var(--blue)', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
    </div>
  )
}
