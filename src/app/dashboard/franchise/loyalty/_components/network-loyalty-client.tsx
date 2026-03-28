// src/app/dashboard/franchise/loyalty/_components/network-loyalty-client.tsx
'use client'
import { useState } from 'react'

interface LoyaltyLevel {
  key: string
  name: string
  min: number
  max: number | null
}

interface NetworkConfig {
  active: boolean
  ptsPerEuro: number
  minRedemptionPts: number
  levels: LoyaltyLevel[]
  networkCustomersCount: number
  goldCount: number
  silverCount: number
  points_issued_month: number
}

interface Props {
  initialConfig: NetworkConfig
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n)
}

export function NetworkLoyaltyClient({ initialConfig }: Props) {
  const [config, setConfig]   = useState(initialConfig)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Editable state for the config form
  const [ptsPerEuro,       setPtsPerEuro]       = useState(String(initialConfig.ptsPerEuro))
  const [minRedemptionPts, setMinRedemptionPts] = useState(String(initialConfig.minRedemptionPts))
  // Tier thresholds: Standard max = levels[0].max, Silver max = levels[1].max
  const [standardMax, setStandardMax] = useState(String(initialConfig.levels[0]?.max ?? 499))
  const [silverMax,   setSilverMax]   = useState(String(initialConfig.levels[1]?.max ?? 1999))

  async function handleSave() {
    setError(null)
    setSaving(true)
    try {
      const stdMax  = parseInt(standardMax, 10)
      const slvMax  = parseInt(silverMax, 10)
      const goldMin = slvMax + 1

      if (isNaN(stdMax) || isNaN(slvMax) || stdMax >= slvMax) {
        setError('Standard max doit être inférieur à Silver max')
        return
      }

      const levels: LoyaltyLevel[] = [
        { key: 'standard', name: 'Standard', min: 0,         max: stdMax  },
        { key: 'silver',   name: 'Silver',   min: stdMax + 1, max: slvMax },
        { key: 'gold',     name: 'Gold',     min: goldMin,    max: null    },
      ]

      const body = {
        ptsPerEuro:       parseFloat(ptsPerEuro),
        minRedemptionPts: parseInt(minRedemptionPts, 10),
        levels,
      }

      const res = await fetch('/api/loyalty/network-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error?.message ?? 'Erreur lors de la sauvegarde')
        return
      }

      setConfig(prev => ({ ...prev, ...body, levels }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const standardCount = config.networkCustomersCount - config.goldCount - config.silverCount

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Fidélité réseau</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">Configuration du programme de fidélité commun à tout le réseau</p>
      </div>

      {/* Stats section */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase text-[var(--text4)] mb-1">Membres réseau</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(config.networkCustomersCount)}</p>
          <div className="flex gap-3 mt-1.5">
            <span className="text-xs" style={{ color: '#fbbf24' }}>🥇 {config.goldCount} Gold</span>
            <span className="text-xs" style={{ color: '#94a3b8' }}>🥈 {config.silverCount} Silver</span>
            <span className="text-xs text-[var(--text4)]">{standardCount} Standard</span>
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs uppercase text-[var(--text4)] mb-1">Points émis ce mois</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(config.points_issued_month)}</p>
          <p className="text-xs text-[var(--text4)] mt-1">pts accumulés dans le réseau</p>
        </div>
      </div>

      {/* Config editor */}
      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="text-sm font-semibold text-[var(--text1)] mb-4">Configuration</h2>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text3)] mb-1">Points par euro</label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={ptsPerEuro}
                onChange={e => setPtsPerEuro(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text3)] mb-1">Points min. rédemption</label>
              <input
                type="number"
                min="0"
                value={minRedemptionPts}
                onChange={e => setMinRedemptionPts(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)]"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--text3)] mb-2">Seuils de tiers</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium text-[var(--text2)] mb-2">Standard</p>
                <p className="text-xs text-[var(--text4)]">0 pts —</p>
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min="0"
                    value={standardMax}
                    onChange={e => setStandardMax(e.target.value)}
                    className="w-20 px-2 py-1 rounded text-xs text-[var(--text1)]"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  />
                  <span className="text-xs text-[var(--text4)]">pts max</span>
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: '#94a3b8' }}>Silver</p>
                <p className="text-xs text-[var(--text4)] mt-1">{parseInt(standardMax) + 1} pts —</p>
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    min="0"
                    value={silverMax}
                    onChange={e => setSilverMax(e.target.value)}
                    className="w-20 px-2 py-1 rounded text-xs text-[var(--text1)]"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  />
                  <span className="text-xs text-[var(--text4)]">pts max</span>
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: '#fbbf24' }}>Gold</p>
                <p className="text-xs text-[var(--text4)] mt-1">{parseInt(silverMax) + 1} pts+</p>
                <p className="text-xs text-[var(--text4)] mt-1">Sans maximum</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs" style={{ color: 'var(--red)' }}>{error}</p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: saved ? 'var(--green)' : 'var(--blue)',
              color: 'white',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
