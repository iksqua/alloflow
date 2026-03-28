'use client'
// src/app/dashboard/crm/nouveau/_components/new-customer-form.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  establishmentId: string
}

export function NewCustomerForm({ establishmentId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState<'femme' | 'homme' | 'autre' | ''>('')
  const [birthdate, setBirthdate] = useState('')
  const [optInSms, setOptInSms] = useState(false)
  const [optInEmail, setOptInEmail] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) { setError('Le prénom est requis'); return }
    if (!phone.trim() && !email.trim()) { setError('Téléphone ou email requis'); return }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/crm/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishment_id: establishmentId,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' '),
          phone: phone.trim() || null,
          email: email.trim() || null,
          gender: gender || null,
          birthdate: birthdate || null,
          opt_in_sms: optInSms,
          opt_in_email: optInEmail,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Erreur lors de la création')
      }
      router.push('/dashboard/crm')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full h-10 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Prénom + Nom */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Prénom *</label>
          <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Marie" className={inputCls} style={{ background: 'var(--surface2)' }} required />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Nom</label>
          <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Dupont" className={inputCls} style={{ background: 'var(--surface2)' }} />
        </div>
      </div>

      {/* Téléphone */}
      <div>
        <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Téléphone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+33612345678" type="tel" className={inputCls} style={{ background: 'var(--surface2)' }} />
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="marie@exemple.fr" type="email" className={inputCls} style={{ background: 'var(--surface2)' }} />
      </div>

      {/* Genre + Date de naissance */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Genre</label>
          <select value={gender} onChange={e => setGender(e.target.value as typeof gender)} className={inputCls} style={{ background: 'var(--surface2)' }}>
            <option value="">Non précisé</option>
            <option value="femme">Femme</option>
            <option value="homme">Homme</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Date de naissance</label>
          <input value={birthdate} onChange={e => setBirthdate(e.target.value)} type="date" className={inputCls} style={{ background: 'var(--surface2)' }} />
        </div>
      </div>

      {/* Opt-ins */}
      <div className="space-y-2 pt-1">
        <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Consentements</label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={optInSms} onChange={e => setOptInSms(e.target.checked)} className="w-4 h-4 rounded accent-[var(--blue)]" />
          <span className="text-sm text-[var(--text2)]">Accepte les SMS marketing</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={optInEmail} onChange={e => setOptInEmail(e.target.checked)} className="w-4 h-4 rounded accent-[var(--blue)]" />
          <span className="text-sm text-[var(--text2)]">Accepte les emails marketing</span>
        </label>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }}>
          {error}
        </div>
      )}

      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={() => router.back()} className="h-9 px-4 rounded-lg text-sm text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors" style={{ background: 'var(--surface)' }}>
          Annuler
        </button>
        <button type="submit" disabled={loading} className="h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--blue)' }}>
          {loading ? 'Création...' : 'Créer le client'}
        </button>
      </div>
    </form>
  )
}
