'use client'
import { useRouter } from 'next/navigation'
import { CustomerEditForm } from './customer-edit-form'

interface CustomerForEdit {
  id: string
  gender: string | null
  birthdate: string | null
  opt_in_sms: boolean
  opt_in_email: boolean
  opt_in_whatsapp: boolean
  tags: string[]
  notes: string | null
}

interface Props { customer: CustomerForEdit }

export function CustomerProfileClient({ customer }: Props) {
  const router = useRouter()
  return (
    <div className="mt-6 border-t border-[var(--border)] pt-5">
      <h2 className="text-sm font-semibold text-[var(--text2)] mb-4">Profil & consentements</h2>
      <CustomerEditForm customer={customer} onSaved={() => router.refresh()} />
    </div>
  )
}
