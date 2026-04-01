// src/app/dashboard/settings/_components/team-page-client.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { InviteModal } from './invite-modal'

interface Member {
  id:              string
  first_name:      string
  email:           string
  role:            string
  last_sign_in_at: string | null
}

interface Props { initialMembers: Member[] }

function formatLastSeen(date: string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date))
}

export function TeamPageClient({ initialMembers }: Props) {
  const [members,        setMembers]        = useState<Member[]>(initialMembers)
  const [showInvite,     setShowInvite]     = useState(false)
  const [removing,       setRemoving]       = useState<string | null>(null)
  const [confirmRemove,  setConfirmRemove]  = useState<string | null>(null)
  const [resendings,     setResendings]     = useState<Set<string>>(new Set())

  async function refreshMembers() {
    const res = await fetch('/api/settings/team')
    if (res.ok) {
      const d = await res.json()
      setMembers(d.members ?? [])
    }
  }

  async function handleRemove(memberId: string) {
    setConfirmRemove(null)
    setRemoving(memberId)
    try {
      const res = await fetch(`/api/settings/team/${memberId}`, { method: 'DELETE' })
      if (res.status === 409) {
        const d = await res.json()
        toast.error(d.error)
        return
      }
      if (res.ok) {
        toast.success('Membre retiré')
        await refreshMembers()
      } else {
        toast.error('Erreur lors de la suppression')
      }
    } finally {
      setRemoving(null)
    }
  }

  async function handleResend(memberId: string) {
    setResendings(prev => new Set([...prev, memberId]))
    try {
      const res = await fetch(`/api/settings/team/${memberId}/resend`, { method: 'POST' })
      if (!res.ok) toast.error('Erreur lors du renvoi')
      else toast.success('Invitation renvoyée')
    } finally {
      setResendings(prev => { const s = new Set(prev); s.delete(memberId); return s })
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">
          Équipe · {members.length} membre{members.length !== 1 ? 's' : ''}
        </h1>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--blue)' }}
        >
          + Inviter
        </button>
      </div>

      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ background: 'var(--surface2)', color: 'var(--text4)', fontSize: '11px' }}>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Membre</th>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Rôle</th>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Statut</th>
              <th className="px-4 py-3 text-left font-medium uppercase tracking-wider">Dernière connexion</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const isActive  = !!m.last_sign_in_at
              const isPending = !m.last_sign_in_at
              const initial   = (m.first_name?.[0] ?? m.email[0] ?? '?').toUpperCase()
              return (
                <tr key={m.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, background: 'var(--surface)' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: isActive ? 'var(--blue)' : 'var(--surface2)', color: isActive ? 'white' : 'var(--text4)' }}
                      >
                        {initial}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text1)]">{m.first_name || '—'}</p>
                        <p className="text-xs text-[var(--text4)]">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={
                        ['admin', 'super_admin'].includes(m.role)
                          ? { background: '#1e3a5f', color: '#93c5fd' }
                          : { background: '#14532d', color: '#4ade80' }
                      }
                    >
                      {['admin', 'super_admin'].includes(m.role) ? 'Admin' : 'Caissier'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isActive
                      ? <span style={{ color: 'var(--green)', fontSize: '13px' }}>● Actif</span>
                      : <span style={{ color: 'var(--amber)', fontSize: '13px' }}>⏳ Invitation envoyée</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text4)]">
                    {formatLastSeen(m.last_sign_in_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(isActive || isPending) && confirmRemove === m.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs text-[var(--text3)]">Confirmer ?</span>
                        <button
                          onClick={() => handleRemove(m.id)}
                          disabled={removing === m.id}
                          className="text-xs font-semibold"
                          style={{ color: 'var(--red)' }}
                        >
                          {removing === m.id ? '…' : 'Oui'}
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="text-xs text-[var(--text4)] hover:text-[var(--text2)] transition-colors"
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <>
                        {isActive && (
                          <button
                            onClick={() => setConfirmRemove(m.id)}
                            disabled={removing === m.id}
                            className="text-xs font-medium transition-opacity"
                            style={{ color: 'var(--red)', opacity: removing === m.id ? 0.5 : 1 }}
                          >
                            {removing === m.id ? '…' : 'Retirer'}
                          </button>
                        )}
                        {isPending && (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => handleResend(m.id)}
                              disabled={resendings.has(m.id)}
                              className="text-xs text-[var(--text4)] hover:text-[var(--text2)] transition-colors"
                            >
                              {resendings.has(m.id) ? 'Envoi…' : 'Renvoyer'}
                            </button>
                            <span style={{ color: 'var(--border)' }}>·</span>
                            <button
                              onClick={() => setConfirmRemove(m.id)}
                              className="text-xs text-[var(--text4)] hover:text-[var(--red)] transition-colors"
                            >
                              Annuler
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={async () => {
            setShowInvite(false)
            await refreshMembers()
          }}
        />
      )}
    </>
  )
}
