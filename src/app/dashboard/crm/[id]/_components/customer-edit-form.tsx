'use client'
import { useState } from 'react'

interface Customer {
  id: string
  gender: string | null
  birthdate: string | null
  opt_in_sms: boolean
  opt_in_email: boolean
  opt_in_whatsapp: boolean
  tags: string[]
  notes?: string | null
}

interface Props {
  customer: Customer
  onSaved: (updated: Customer) => void
}

const GENDER_OPTIONS = [
  { value: 'homme', label: 'Homme' },
  { value: 'femme', label: 'Femme' },
  { value: 'autre', label: 'Autre' },
]

export function CustomerEditForm({ customer, onSaved }: Props) {
  const [gender, setGender]           = useState(customer.gender ?? '')
  const [birthdate, setBirthdate]     = useState(customer.birthdate ?? '')
  const [optSms, setOptSms]           = useState(customer.opt_in_sms)
  const [optEmail, setOptEmail]       = useState(customer.opt_in_email)
  const [optWa, setOptWa]             = useState(customer.opt_in_whatsapp)
  const [tagsRaw, setTagsRaw]         = useState(customer.tags.join(', '))
  const [notes, setNotes]             = useState(customer.notes ?? '')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)

    const res = await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gender:          gender || null,
        birthdate:       birthdate || null,
        opt_in_sms:      optSms,
        opt_in_email:    optEmail,
        opt_in_whatsapp: optWa,
        tags,
        notes,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur lors de la sauvegarde')
      return
    }

    const updated = await res.json() as Customer
    onSaved(updated)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Gender */}
      <div>
        <label className="block text-xs font-medium text-[var(--text3)] mb-1.5">Genre</label>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setGender('')}
            className={[
              'px-3 py-1.5 rounded-lg text-xs transition-colors',
              gender === '' ? 'bg-[var(--blue)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface)]',
            ].join(' ')}
          >
            Non précisé
          </button>
          {GENDER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGender(opt.value)}
              className={[
                'px-3 py-1.5 rounded-lg text-xs transition-colors',
                gender === opt.value ? 'bg-[var(--blue)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface)]',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Birthdate */}
      <div>
        <label htmlFor="birthdate" className="block text-xs font-medium text-[var(--text3)] mb-1.5">
          Date de naissance
        </label>
        <input
          id="birthdate"
          type="date"
          value={birthdate}
          onChange={e => setBirthdate(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
      </div>

      {/* Opt-ins */}
      <div>
        <div className="text-xs font-medium text-[var(--text3)] mb-2">Consentements (RGPD)</div>
        <div className="flex flex-col gap-2">
          {[
            { id: 'opt_sms',   label: 'SMS',      value: optSms,   setter: setOptSms },
            { id: 'opt_email', label: 'Email',     value: optEmail, setter: setOptEmail },
            { id: 'opt_wa',    label: 'WhatsApp',  value: optWa,    setter: setOptWa },
          ].map(({ id, label, value, setter }) => (
            <label key={id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id={id}
                checked={value}
                onChange={e => setter(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--blue)]"
              />
              <span className="text-sm text-[var(--text2)]">Opt-in {label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <label htmlFor="tags" className="block text-xs font-medium text-[var(--text3)] mb-1.5">
          Tags (séparés par des virgules)
        </label>
        <input
          id="tags"
          type="text"
          value={tagsRaw}
          onChange={e => setTagsRaw(e.target.value)}
          placeholder="vip, influenceur, allergie-gluten"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-xs font-medium text-[var(--text3)] mb-1.5">
          Notes internes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
        style={{ background: 'var(--blue)' }}
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </form>
  )
}
