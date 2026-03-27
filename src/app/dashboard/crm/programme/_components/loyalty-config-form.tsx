// src/app/dashboard/crm/programme/_components/loyalty-config-form.tsx
'use client'
import { useState } from 'react'

interface Level {
  key: string
  name: string
  min: number
  max: number | null
  description: string
}

interface Reward {
  id?: string
  name: string
  ptsRequired: number
  type: string
  value: number
  levelRequired: string
  active: boolean
}

interface Config {
  active: boolean
  ptsPerEuro: number
  signupBonus: number
  ptsValidityDays: number
  minRedemptionPts: number
  levels: Level[]
  rewards: Reward[]
}

interface Props {
  initialConfig: Config
}

const REWARD_TYPES = [
  { value: 'produit_offert',  label: 'Produit offert' },
  { value: 'reduction_euros', label: 'Réduction (€)' },
  { value: 'reduction_pct',   label: 'Réduction (%)' },
]

const TIER_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'silver',   label: 'Silver' },
  { value: 'gold',     label: 'Gold' },
]

const TIER_COLORS: Record<string, string> = {
  standard: 'text-slate-300',
  silver:   'text-slate-300',
  gold:     'text-amber-400',
}

const TIER_BADGE: Record<string, string> = {
  standard: 'bg-slate-700/50 border-slate-600/30',
  silver:   'bg-slate-500/10 border-slate-400/20',
  gold:     'bg-amber-500/10 border-amber-400/20',
}

function emptyReward(): Reward {
  return { name: '', ptsRequired: 100, type: 'produit_offert', value: 0, levelRequired: 'standard', active: true }
}

export function LoyaltyConfigForm({ initialConfig }: Props) {
  const [active,           setActive]           = useState(initialConfig.active)
  const [ptsPerEuro,       setPtsPerEuro]       = useState(String(initialConfig.ptsPerEuro))
  const [signupBonus,      setSignupBonus]      = useState(String(initialConfig.signupBonus))
  const [ptsValidityDays,  setPtsValidityDays]  = useState(String(initialConfig.ptsValidityDays))
  const [minRedemptionPts, setMinRedemptionPts] = useState(String(initialConfig.minRedemptionPts))
  const [levels,           setLevels]           = useState<Level[]>(initialConfig.levels)
  const [rewards,          setRewards]          = useState<Reward[]>(initialConfig.rewards)
  const [saving,           setSaving]           = useState(false)
  const [toast,            setToast]            = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  function updateLevelDescription(key: string, description: string) {
    setLevels(prev => prev.map(l => l.key === key ? { ...l, description } : l))
  }

  function addReward() {
    setRewards(prev => [...prev, emptyReward()])
  }

  function removeReward(idx: number) {
    setRewards(prev => prev.filter((_, i) => i !== idx))
  }

  function updateReward<K extends keyof Reward>(idx: number, field: K, value: Reward[K]) {
    setRewards(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/loyalty/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active,
          ptsPerEuro:       parseFloat(ptsPerEuro) || 1,
          signupBonus:      parseInt(signupBonus) || 0,
          ptsValidityDays:  parseInt(ptsValidityDays) || 365,
          minRedemptionPts: parseInt(minRedemptionPts) || 100,
          levels,
          rewards,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(typeof j.error === 'string' ? j.error : 'Erreur serveur')
      }
      showToast('Configuration sauvegardée', true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-16 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border transition-all ${
          toast.ok
            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/20 border-red-500/30 text-red-300'
        }`}>
          {toast.ok ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      {/* Programme ON/OFF */}
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-slate-100">Programme de fidélité</p>
            <p className="text-xs text-slate-400 mt-0.5">Activer ou désactiver le programme pour votre établissement</p>
          </div>
          <button
            type="button"
            onClick={() => setActive(v => !v)}
            className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
            style={{ background: active ? '#8b5cf6' : 'var(--border)' }}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Points */}
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
        <p className="text-[13px] font-semibold text-slate-100 mb-4">Règles de points</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
              Points par euro dépensé
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={ptsPerEuro}
              onChange={e => setPtsPerEuro(e.target.value)}
              className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text1)] focus:outline-none focus:border-violet-500/50 transition-colors"
              style={{ background: 'var(--surface2)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
              Bonus inscription (pts)
            </label>
            <input
              type="number"
              min="0"
              value={signupBonus}
              onChange={e => setSignupBonus(e.target.value)}
              className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text1)] focus:outline-none focus:border-violet-500/50 transition-colors"
              style={{ background: 'var(--surface2)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
              Validité des points (jours)
            </label>
            <input
              type="number"
              min="1"
              value={ptsValidityDays}
              onChange={e => setPtsValidityDays(e.target.value)}
              className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text1)] focus:outline-none focus:border-violet-500/50 transition-colors"
              style={{ background: 'var(--surface2)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
              Seuil minimum d&apos;échange (pts)
            </label>
            <input
              type="number"
              min="0"
              value={minRedemptionPts}
              onChange={e => setMinRedemptionPts(e.target.value)}
              className="w-full border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text1)] focus:outline-none focus:border-violet-500/50 transition-colors"
              style={{ background: 'var(--surface2)' }}
            />
          </div>
        </div>
      </div>

      {/* Niveaux */}
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
        <p className="text-[13px] font-semibold text-slate-100 mb-4">Niveaux de fidélité</p>
        <div className="grid grid-cols-3 gap-3">
          {levels.map(level => (
            <div
              key={level.key}
              className={`rounded-xl border p-4 ${TIER_BADGE[level.key] ?? 'bg-slate-700/30 border-slate-600/30'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-bold ${TIER_COLORS[level.key] ?? 'text-slate-300'}`}>
                  {level.name}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2">
                {level.min} – {level.max !== null ? level.max : '∞'} pts
              </p>
              <label className="block text-[10px] font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">
                Description
              </label>
              <textarea
                value={level.description}
                onChange={e => updateLevelDescription(level.key, e.target.value)}
                rows={2}
                placeholder="Avantages du niveau..."
                className="w-full border border-white/10 rounded-lg px-2 py-1.5 text-xs text-[var(--text1)] resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
                style={{ background: 'var(--surface2)' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Récompenses */}
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-semibold text-slate-100">Récompenses</p>
          <button
            type="button"
            onClick={addReward}
            className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors"
          >
            + Ajouter une récompense
          </button>
        </div>

        {rewards.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4 border border-dashed border-white/10 rounded-xl">
            Aucune récompense — cliquez sur + Ajouter une récompense
          </p>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_120px_80px_120px_36px] gap-2 px-1">
              {['Nom', 'Points', 'Type', 'Valeur', 'Niveau', ''].map(h => (
                <span key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{h}</span>
              ))}
            </div>

            {rewards.map((reward, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_120px_80px_120px_36px] gap-2 items-center">
                <input
                  type="text"
                  value={reward.name}
                  onChange={e => updateReward(idx, 'name', e.target.value)}
                  placeholder="Café offert"
                  className="border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--text1)] focus:outline-none focus:border-violet-500/50 transition-colors"
                  style={{ background: 'var(--surface2)' }}
                />
                <input
                  type="number"
                  min="1"
                  value={reward.ptsRequired}
                  onChange={e => updateReward(idx, 'ptsRequired', parseInt(e.target.value) || 0)}
                  className="border border-white/10 rounded-lg px-2 py-2 text-sm text-[var(--text1)] text-right focus:outline-none focus:border-violet-500/50 transition-colors"
                  style={{ background: 'var(--surface2)' }}
                />
                <select
                  value={reward.type}
                  onChange={e => updateReward(idx, 'type', e.target.value)}
                  className="border border-white/10 rounded-lg px-2 py-2 text-xs text-[var(--text1)] focus:outline-none focus:border-violet-500/50 transition-colors"
                  style={{ background: 'var(--surface2)' }}
                >
                  {REWARD_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={reward.value}
                  onChange={e => updateReward(idx, 'value', parseFloat(e.target.value) || 0)}
                  className="border border-white/10 rounded-lg px-2 py-2 text-sm text-[var(--text1)] text-right focus:outline-none focus:border-violet-500/50 transition-colors"
                  style={{ background: 'var(--surface2)' }}
                />
                <select
                  value={reward.levelRequired}
                  onChange={e => updateReward(idx, 'levelRequired', e.target.value)}
                  className="border border-white/10 rounded-lg px-2 py-2 text-xs text-[var(--text1)] focus:outline-none focus:border-violet-500/50 transition-colors"
                  style={{ background: 'var(--surface2)' }}
                >
                  {TIER_OPTIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeReward(idx)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-red-500/60 hover:text-red-400 hover:bg-red-500/10 transition-colors text-lg font-bold"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end pb-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 hover:brightness-110"
          style={{ background: saving ? '#7c3aed' : '#8b5cf6' }}
        >
          {saving ? 'Enregistrement...' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  )
}
