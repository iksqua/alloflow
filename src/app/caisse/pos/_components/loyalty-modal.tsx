// src/app/caisse/pos/_components/loyalty-modal.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import type { LoyaltyCustomer, LoyaltyReward } from '../types'

type ModalState = 'searching' | 'found' | 'new-customer'

interface Props {
  open: boolean
  orderTotal: number
  onClose: () => void
  onConfirm: (customer: LoyaltyCustomer, reward: LoyaltyReward | null) => void
  onSkip: () => void
}

function tierLabel(tier: string) {
  if (tier === 'gold')   return { label: 'Gold',     cls: 'bg-yellow-900/20 text-yellow-400' }
  if (tier === 'silver') return { label: 'Silver',   cls: 'bg-slate-700/40 text-slate-300'   }
  return                        { label: 'Standard', cls: 'bg-[var(--surface2)] text-[var(--text4)]' }
}

export function LoyaltyModal({ open, orderTotal, onClose, onConfirm, onSkip }: Props) {
  const [query,       setQuery]       = useState('')
  const [state,       setState]       = useState<ModalState>('searching')
  const [customers,   setCustomers]   = useState<LoyaltyCustomer[]>([])
  const [selected,    setSelected]    = useState<LoyaltyCustomer | null>(null)
  const [rewards,     setRewards]     = useState<LoyaltyReward[]>([])
  const [chosenReward,setChosenReward]= useState<LoyaltyReward | null>(null)
  const [searching,   setSearching]   = useState(false)

  // New customer form
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName,  setNewLastName]  = useState('')
  const [newPhone,     setNewPhone]     = useState('')
  const [newEmail,     setNewEmail]     = useState('')
  const [newOptInSms,  setNewOptInSms]  = useState(false)
  const [newOptInEmail,setNewOptInEmail]= useState(false)
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setQuery(''); setState('searching'); setCustomers([]); setSelected(null)
      setRewards([]); setChosenReward(null); setSearching(false)
      setNewFirstName(''); setNewLastName(''); setNewPhone(''); setNewEmail('')
      setNewOptInSms(false); setNewOptInEmail(false); setFormError(null)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (state !== 'searching') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 3) { setCustomers([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setCustomers(json.customers ?? [])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, state])

  async function selectCustomer(c: LoyaltyCustomer) {
    setSelected(c)
    const res = await fetch(`/api/customers/${c.id}/rewards`)
    const json = await res.json()
    setRewards(json.rewards ?? [])
    setState('found')
  }

  async function handleCreate() {
    if (!newFirstName.trim() || (!newPhone.trim() && !newEmail.trim())) {
      setFormError('Prénom et (téléphone ou email) requis')
      return
    }
    setSaving(true); setFormError(null)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name:   newFirstName.trim(),
          last_name:    newLastName.trim() || null,
          phone:        newPhone.trim() || null,
          email:        newEmail.trim() || null,
          opt_in_sms:   newOptInSms,
          opt_in_email: newOptInEmail,
        }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur') }
      const customer: LoyaltyCustomer = await res.json()
      onConfirm(customer, null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const pointsToEarn = Math.round(orderTotal - (chosenReward
    ? chosenReward.discount_type === 'percent'
      ? Math.round(orderTotal * (chosenReward.discount_value / 100) * 100) / 100
      : chosenReward.discount_value
    : 0))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--surface)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-bold text-[var(--text1)]">🎁 Programme fidélité</h2>
            <p className="text-xs text-[var(--text4)]">Identifiez le client pour créditer ses points</p>
          </div>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">✕</button>
        </div>

        <div className="p-5 space-y-4">

          {/* STATE: searching */}
          {state === 'searching' && (
            <>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Téléphone ou email du client…"
                className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm focus:outline-none focus:border-[var(--blue)]"
              />

              {searching && (
                <p className="text-xs text-[var(--text4)] text-center py-2">Recherche…</p>
              )}

              {!searching && query.length >= 3 && customers.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-[var(--text3)] mb-3">Aucun compte trouvé</p>
                  <p className="text-xs text-[var(--text4)] mb-4">Inscrire en 10 secondes — le client gagne +{Math.round(orderTotal)} pts dès aujourd&#39;hui</p>
                  <button
                    onClick={() => {
                      if (query.includes('@')) setNewEmail(query)
                      else setNewPhone(query)
                      setState('new-customer')
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ background: 'var(--blue)' }}
                  >
                    + Inscrire ce client
                  </button>
                </div>
              )}

              {customers.length > 0 && (
                <div className="space-y-2">
                  {customers.map(c => {
                    const tier = tierLabel(c.tier)
                    return (
                      <button key={c.id} onClick={() => selectCustomer(c)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-[var(--border)] hover:border-[var(--blue)]/50 transition-colors text-left"
                        style={{ background: 'var(--bg)' }}>
                        <div className="w-9 h-9 rounded-full bg-[var(--blue)] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                          {c.first_name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-[var(--text1)]">{c.first_name} {c.last_name ?? ''}</div>
                          <div className="text-xs text-[var(--text4)]">{c.phone ?? c.email} · {c.points} pts</div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tier.cls}`}>{tier.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* STATE: found */}
          {state === 'found' && selected && (
            <>
              {/* Client card */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)]" style={{ background: 'var(--bg)' }}>
                <div className="w-10 h-10 rounded-full bg-[var(--blue)] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {selected.first_name[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[var(--text1)]">{selected.first_name} {selected.last_name ?? ''}</div>
                  <div className="text-xs text-[var(--text4)]">
                    {selected.points} pts actuels · +{pointsToEarn} pts sur cette commande
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tierLabel(selected.tier).cls}`}>
                  {tierLabel(selected.tier).label}
                </span>
              </div>

              {/* Rewards */}
              {rewards.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Récompenses disponibles</p>
                  <div className="space-y-1.5">
                    {rewards.map(r => (
                      <button key={r.id}
                        onClick={() => setChosenReward(chosenReward?.id === r.id ? null : r)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors text-sm ${
                          chosenReward?.id === r.id
                            ? 'border-[var(--green)] bg-[var(--green-bg)] text-[var(--green)]'
                            : 'border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]'
                        }`}>
                        <span>{r.name}</span>
                        <span className="text-xs font-semibold">
                          {r.discount_type === 'percent' ? `−${r.discount_value}%` : `−${r.discount_value.toFixed(2)} €`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rewards.length === 0 && (
                <p className="text-xs text-[var(--text4)] text-center py-1">Aucune récompense disponible (points insuffisants)</p>
              )}

              <button
                onClick={() => onConfirm(selected, chosenReward)}
                className="w-full py-3 rounded-xl text-sm font-bold text-white"
                style={{ background: 'var(--blue)' }}
              >
                Confirmer (+{pointsToEarn} pts) →
              </button>
            </>
          )}

          {/* STATE: new-customer */}
          {state === 'new-customer' && (
            <>
              <p className="text-xs text-[var(--text4)]">
                Inscrire en 10 secondes — le client gagne +{Math.round(orderTotal)} pts dès aujourd&#39;hui
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[var(--text4)]">Prénom *</label>
                  <input value={newFirstName} onChange={e => setNewFirstName(e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text4)]">Nom</label>
                  <input value={newLastName} onChange={e => setNewLastName(e.target.value)}
                    className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text4)]">Téléphone *</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                  className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text4)]">Email</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  className="mt-0.5 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
              </div>
              {/* RGPD opt-ins */}
              <div className="mt-3 border-t border-[var(--border)] pt-3">
                <p className="text-xs text-[var(--text3)] mb-2">Consentements communications (RGPD)</p>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newOptInSms}
                      onChange={e => setNewOptInSms(e.target.checked)}
                      className="w-4 h-4 rounded accent-[var(--blue)]"
                    />
                    <span className="text-xs text-[var(--text2)]">Opt-in SMS</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newOptInEmail}
                      onChange={e => setNewOptInEmail(e.target.checked)}
                      className="w-4 h-4 rounded accent-[var(--blue)]"
                    />
                    <span className="text-xs text-[var(--text2)]">Opt-in Email</span>
                  </label>
                </div>
                <p className="text-[10px] text-[var(--text4)] mt-1">
                  Le client consent à recevoir des communications de notre établissement.
                </p>
              </div>
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--blue)' }}
              >
                {saving ? 'Inscription…' : 'Inscrire & continuer →'}
              </button>
            </>
          )}

          {/* Skip link (always visible) */}
          <div className="text-center">
            <button onClick={onSkip} className="text-xs text-[var(--text4)] hover:text-[var(--text2)] underline">
              Passer sans fidélité
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
