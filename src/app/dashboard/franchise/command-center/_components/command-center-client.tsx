'use client'
import { useState } from 'react'

interface EstablishmentStat {
  id:               string
  name:             string
  type:             'own' | 'franchise'
  ca_yesterday:     number
  ca_month:         number
  royalty_rate:     number
  marketing_rate:   number
  royalty_amount:   number
  marketing_amount: number
  alerts:           string[]
}

interface NetworkStats {
  ca_yesterday:  number
  ca_month:      number
  ca_month_prev: number
}

interface Props {
  initialData: {
    network:        NetworkStats
    establishments: EstablishmentStat[]
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function pct(current: number, prev: number) {
  if (prev === 0) return null
  const delta = Math.round(((current - prev) / prev) * 100)
  return delta
}

export function CommandCenterClient({ initialData }: Props) {
  const [data, setData] = useState(initialData)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/franchise/network-stats', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally {
      setRefreshing(false)
    }
  }

  const { network, establishments } = data

  // Totals "dans ma poche"
  const franchiseEst    = establishments.filter(e => e.type === 'franchise')
  const totalRoyalties  = franchiseEst.reduce((s, e) => s + e.royalty_amount,   0)
  const totalMarketing  = franchiseEst.reduce((s, e) => s + e.marketing_amount, 0)
  const ownEst          = establishments.filter(e => e.type === 'own')
  const totalLaboSales  = ownEst.reduce((s, e) => s + e.ca_month, 0)
  const totalPocket     = totalRoyalties + totalMarketing + totalLaboSales

  const evolution = pct(network.ca_month, network.ca_month_prev)

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Command Center</h1>
          <p className="text-sm text-[var(--text4)] mt-0.5">Vue réseau en temps réel</p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg transition-opacity"
          style={{ background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)', opacity: refreshing ? 0.5 : 1 }}
        >
          {refreshing ? '↻ Actualisation…' : '↻ Actualiser'}
        </button>
      </div>

      {/* Bloc "Dans ma poche ce mois" */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: 'linear-gradient(135deg, #0f1f35 0%, #0a1628 100%)', border: '1px solid #1e3a5f' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#60a5fa' }}>
          💰 Dans ma poche — ce mois
        </p>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="text-xs mb-1" style={{ color: '#4a6a8a' }}>Royalties</p>
            <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{fmt(totalRoyalties)}</p>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: '#4a6a8a' }}>Fonds marketing</p>
            <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{fmt(totalMarketing)}</p>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: '#4a6a8a' }}>Ventes labo</p>
            <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{fmt(totalLaboSales)}</p>
          </div>
          <div className="pl-4" style={{ borderLeft: '1px solid #1e3a5f' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#93c5fd' }}>TOTAL</p>
            <p className="text-3xl font-bold text-white">{fmt(totalPocket)}</p>
          </div>
        </div>
      </div>

      {/* KPIs réseau */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs uppercase text-[var(--text4)] mb-1">CA réseau — hier</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(network.ca_yesterday)}</p>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs uppercase text-[var(--text4)] mb-1">CA réseau — ce mois</p>
          <p className="text-2xl font-bold text-[var(--text1)]">{fmt(network.ca_month)}</p>
          {evolution !== null && (
            <p className="text-xs mt-1" style={{ color: evolution >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {evolution >= 0 ? '↑' : '↓'} {Math.abs(evolution)}% vs mois dernier
            </p>
          )}
        </div>
      </div>

      {/* Tableau par établissement */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        {/* Table header */}
        <div
          className="grid text-xs uppercase font-semibold px-4 py-2"
          style={{
            gridTemplateColumns: '1.5fr 90px 100px 70px 80px 80px 100px',
            gap: '8px',
            background: 'var(--surface2)',
            color: 'var(--text4)',
            letterSpacing: '0.07em',
          }}
        >
          <span>Boutique</span>
          <span>CA hier</span>
          <span>CA mois</span>
          <span>Roy.%</span>
          <span>Roy.€</span>
          <span>Mktg.€</span>
          <span style={{ color: '#60a5fa' }}>→ Franchiseur</span>
        </div>

        {establishments.map((est, i) => {
          const total = est.royalty_amount + est.marketing_amount
          return (
            <div
              key={est.id}
              className="grid items-center px-4 py-3"
              style={{
                gridTemplateColumns: '1.5fr 90px 100px 70px 80px 80px 100px',
                gap: '8px',
                borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                background: 'var(--surface)',
              }}
            >
              {/* Boutique */}
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: est.alerts.length > 0 ? 'var(--amber)' : 'var(--green)' }}
                />
                <div>
                  <p className="text-sm font-medium text-[var(--text1)]">{est.name}</p>
                  <p className="text-xs text-[var(--text4)]">
                    {est.type === 'franchise' ? 'Franchisé' : 'Établissement propre'}
                  </p>
                </div>
              </div>

              {/* CA hier */}
              <span className="text-sm font-semibold text-[var(--text1)]">{fmt(est.ca_yesterday)}</span>

              {/* CA mois */}
              <span className="text-sm font-semibold text-[var(--text1)]">{fmt(est.ca_month)}</span>

              {/* Roy % */}
              <span className="text-sm text-[var(--text3)]">
                {est.type === 'franchise' ? `${est.royalty_rate}%` : '—'}
              </span>

              {/* Roy € */}
              <span className="text-sm" style={{ color: est.type === 'franchise' ? 'var(--green)' : 'var(--text4)' }}>
                {est.type === 'franchise' ? fmt(est.royalty_amount) : '—'}
              </span>

              {/* Mktg € */}
              <span className="text-sm" style={{ color: est.type === 'franchise' ? 'var(--green)' : 'var(--text4)' }}>
                {est.type === 'franchise' ? fmt(est.marketing_amount) : '—'}
              </span>

              {/* Total → franchiseur */}
              <div className="flex items-center gap-2">
                {est.type === 'franchise' ? (
                  <span className="text-sm font-bold" style={{ color: '#60a5fa' }}>{fmt(total)}</span>
                ) : (
                  <span className="text-sm font-medium" style={{ color: '#a78bfa' }}>Direct</span>
                )}
                {est.alerts.map(alert => (
                  <span
                    key={alert}
                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                    style={{ background: '#2a1a1a', color: 'var(--amber)' }}
                    title={alert === 'session_fermee' ? 'Session de caisse non ouverte' : alert}
                  >
                    ⚠
                  </span>
                ))}
              </div>
            </div>
          )
        })}

        {establishments.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text4)]">
            Aucun établissement dans le réseau
          </div>
        )}
      </div>
    </div>
  )
}
