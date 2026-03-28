'use client'
import Link from 'next/link'
import { useState } from 'react'

interface FranchiseeEstablishment {
  id:             string
  name:           string
  type:           'own' | 'franchise'
  royalty_rate:   number
  marketing_rate: number
  start_date:     string | null
  status:         'actif' | 'invitation_envoyee'
}

interface Props { initialEstablishments: FranchiseeEstablishment[] }

export function FranchisesPageClient({ initialEstablishments }: Props) {
  const [establishments] = useState(initialEstablishments)

  const franchisees = establishments.filter(e => e.type === 'franchise')
  const own         = establishments.filter(e => e.type === 'own')

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Franchisés</h1>
          <p className="text-sm text-[var(--text4)] mt-0.5">
            {franchisees.length} franchisé{franchisees.length !== 1 ? 's' : ''} · {own.length} propre{own.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/dashboard/franchise/franchises/nouveau"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--blue)' }}
        >
          + Onboarder un franchisé
        </Link>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* Header */}
        <div
          className="grid px-4 py-2 text-xs font-semibold uppercase tracking-wider"
          style={{ gridTemplateColumns: '1.5fr 80px 80px 80px 100px', gap: '8px', background: 'var(--surface2)', color: 'var(--text4)' }}
        >
          <span>Établissement</span>
          <span>Royalty</span>
          <span>Marketing</span>
          <span>Statut</span>
          <span />
        </div>

        {establishments.map((est, i) => (
          <div
            key={est.id}
            className="grid items-center px-4 py-3"
            style={{
              gridTemplateColumns: '1.5fr 80px 80px 80px 100px',
              gap: '8px',
              borderTop: i > 0 ? '1px solid var(--border)' : undefined,
              background: 'var(--surface)',
            }}
          >
            <div>
              <p className="text-sm font-medium text-[var(--text1)]">{est.name}</p>
              <p className="text-xs text-[var(--text4)]">
                {est.type === 'franchise' ? 'Franchisé' : 'Établissement propre'}
                {est.start_date && ` · depuis ${est.start_date}`}
              </p>
            </div>
            <span className="text-sm text-[var(--text2)]">
              {est.type === 'franchise' ? `${est.royalty_rate}%` : '—'}
            </span>
            <span className="text-sm text-[var(--text2)]">
              {est.type === 'franchise' ? `${est.marketing_rate}%` : '—'}
            </span>
            <span className="text-xs" style={{ color: est.status === 'actif' ? 'var(--green)' : 'var(--amber)' }}>
              {est.status === 'actif' ? '● Actif' : '⏳ Invitation'}
            </span>
            {est.type === 'franchise' ? (
              <Link
                href={`/dashboard/franchise/franchises/${est.id}`}
                className="text-xs font-medium text-right block"
                style={{ color: 'var(--blue)' }}
              >
                Voir →
              </Link>
            ) : (
              <span />
            )}
          </div>
        ))}

        {establishments.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[var(--text4)]">
            Aucun établissement.{' '}
            <Link href="/dashboard/franchise/franchises/nouveau" style={{ color: 'var(--blue)' }}>
              Onboarder le premier franchisé →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
