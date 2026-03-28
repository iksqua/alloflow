'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text1)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  width: '100%',
  outline: 'none',
} as React.CSSProperties

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text4)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.07em',
  marginBottom: '6px',
}

export function OnboardingForm() {
  const router = useRouter()

  const [form, setForm] = useState({
    company_name:       '',
    shop_name:          '',
    manager_email:      '',
    manager_first_name: '',
    royalty_rate:       5,
    marketing_rate:     2,
    start_date:         new Date().toISOString().split('T')[0],
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = ['royalty_rate', 'marketing_rate'].includes(key)
        ? parseFloat(e.target.value) || 0
        : e.target.value
      setForm(prev => ({ ...prev, [key]: val }))
    }
  }

  // Projection automatique
  const estimatedCA = 15000
  const projectedRoyalty   = Math.round(estimatedCA * form.royalty_rate)   / 100
  const projectedMarketing = Math.round(estimatedCA * form.marketing_rate) / 100

  async function handleSubmit() {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/franchise/establishments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(typeof d.error === 'string' ? d.error : 'Erreur lors de l\'onboarding')
      }
      router.push('/dashboard/franchise/franchises')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = form.company_name && form.shop_name && form.manager_email &&
                    form.manager_first_name && form.start_date

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-4">
        <div>
          <label style={labelStyle}>Nom de la société franchisée *</label>
          <input style={inputStyle} value={form.company_name} onChange={set('company_name')} placeholder="Dupont SAS" />
        </div>
        <div>
          <label style={labelStyle}>Nom de la boutique *</label>
          <input style={inputStyle} value={form.shop_name} onChange={set('shop_name')} placeholder="Allocookie Paris 11e" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Prénom du gérant *</label>
            <input style={inputStyle} value={form.manager_first_name} onChange={set('manager_first_name')} placeholder="Jean" />
          </div>
          <div>
            <label style={labelStyle}>Email du gérant *</label>
            <input type="email" style={inputStyle} value={form.manager_email} onChange={set('manager_email')} placeholder="jean@dupont.fr" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={labelStyle}>Royalties (% CA HT) *</label>
            <input
              type="number" min={0} max={50} step={0.5}
              style={inputStyle}
              value={form.royalty_rate}
              onChange={set('royalty_rate')}
            />
          </div>
          <div>
            <label style={labelStyle}>Fonds marketing (% CA HT) *</label>
            <input
              type="number" min={0} max={20} step={0.5}
              style={inputStyle}
              value={form.marketing_rate}
              onChange={set('marketing_rate')}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Date de démarrage *</label>
          <input type="date" style={inputStyle} value={form.start_date} onChange={set('start_date')} />
        </div>

        {/* Projection automatique */}
        <div
          className="rounded-lg p-3 text-sm"
          style={{ background: '#0f1f10', border: '1px solid #1a3a1a' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4a7a4a' }}>
            Projection sur CA estimé de {new Intl.NumberFormat('fr-FR').format(estimatedCA)} €/mois
          </p>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-[var(--text4)]">Royalties</p>
              <p className="font-semibold" style={{ color: '#4ade80' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(projectedRoyalty)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text4)]">Marketing</p>
              <p className="font-semibold" style={{ color: '#4ade80' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(projectedMarketing)}
              </p>
            </div>
            <div className="pl-4" style={{ borderLeft: '1px solid #1a3a1a' }}>
              <p className="text-xs font-semibold" style={{ color: '#93c5fd' }}>TOTAL</p>
              <p className="font-bold" style={{ color: '#60a5fa' }}>
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(projectedRoyalty + projectedMarketing)}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => router.push('/dashboard/franchise/franchises')}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{ background: 'var(--blue)', opacity: (submitting || !canSubmit) ? 0.5 : 1 }}
          >
            {submitting ? 'Onboarding en cours…' : '✉ Créer & inviter'}
          </button>
        </div>
      </div>
    </div>
  )
}
