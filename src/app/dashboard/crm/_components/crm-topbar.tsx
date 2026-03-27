'use client'
// src/app/dashboard/crm/_components/crm-topbar.tsx
import { useRouter } from 'next/navigation'

export function CrmTopbar() {
  const router = useRouter()

  return (
    <div className="flex items-center justify-between mb-5">
      <h1 className="text-xl font-semibold text-[var(--text1)]">CRM — Clients</h1>
      <button
        onClick={() => router.push('/dashboard/crm/programme')}
        className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ background: '#8b5cf6' }}
      >
        Programme fidélité
      </button>
    </div>
  )
}
