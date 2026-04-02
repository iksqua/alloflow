'use client'
import Link from 'next/link'

interface Establishment {
  id: string
  name: string
  type: 'own' | 'franchise'
  royalty_rate: number
  marketing_rate: number
  start_date: string | null
  status: 'actif' | 'invitation_envoyee'
}

interface Props {
  establishments: Establishment[]
}

export function PilotagePageClient({ establishments }: Props) {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Pilotage des établissements</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">
          Gérez les produits, stocks et recettes de chaque établissement du réseau
        </p>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {/* Header */}
        <div
          className="grid px-4 py-2 text-xs font-semibold uppercase tracking-wider"
          style={{
            gridTemplateColumns: '1.5fr 90px 110px auto',
            gap: '8px',
            background: 'var(--surface2)',
            color: 'var(--text4)',
          }}
        >
          <span>Établissement</span>
          <span>Type</span>
          <span>Statut</span>
          <span />
        </div>

        {establishments.map((est, i) => (
          <div
            key={est.id}
            className="grid items-center px-4 py-3"
            style={{
              gridTemplateColumns: '1.5fr 90px 110px auto',
              gap: '8px',
              borderTop: i > 0 ? '1px solid var(--border)' : undefined,
              background: 'var(--surface)',
            }}
          >
            <div>
              <p className="text-sm font-medium text-[var(--text1)]">{est.name}</p>
              {est.start_date && (
                <p className="text-xs text-[var(--text4)]">depuis {est.start_date}</p>
              )}
            </div>

            <span className="text-xs font-medium" style={{ color: est.type === 'franchise' ? 'var(--blue)' : 'var(--text2)' }}>
              {est.type === 'franchise' ? 'Franchisé' : 'Propre'}
            </span>

            <span className="text-xs" style={{ color: est.status === 'actif' ? 'var(--green)' : 'var(--amber, #f59e0b)' }}>
              {est.status === 'actif' ? '● Actif' : '⏳ Invitation'}
            </span>

            <Link
              href={`/dashboard/franchise/pilotage/${est.id}`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors text-right whitespace-nowrap"
              style={{ background: 'var(--surface2)', color: 'var(--text1)', border: '1px solid var(--border)' }}
            >
              Piloter →
            </Link>
          </div>
        ))}

        {establishments.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-[var(--text4)]">
            Aucun établissement dans le réseau.{' '}
            <Link href="/dashboard/franchise/franchises/nouveau" style={{ color: 'var(--blue)' }}>
              Onboarder un franchisé →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
