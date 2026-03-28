'use client'
// src/app/dashboard/crm/_components/crm-topbar.tsx
import { useRouter } from 'next/navigation'

export function CrmTopbar() {
  const router = useRouter()

  return (
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-xl font-semibold text-[var(--text1)]">CRM — Clients</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push('/dashboard/crm/programme')}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-[#8b5cf6]/40 text-[#a78bfa] hover:bg-[#8b5cf6]/10 transition-colors"
        >
          Programme fidélité
        </button>
        <button
          onClick={() => router.push('/dashboard/crm/nouveau')}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: '#8b5cf6' }}
        >
          + Nouveau client
        </button>
      </div>
    </div>
  )
}
