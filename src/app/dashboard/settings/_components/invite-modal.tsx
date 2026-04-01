// src/app/dashboard/settings/_components/invite-modal.tsx
'use client'
import { useState } from 'react'

interface Props { onClose: () => void; onSuccess: () => void }

export function InviteModal({ onClose, onSuccess }: Props) {
  const [email,     setEmail]     = useState('')
  const [firstName, setFirstName] = useState('')
  const [role,      setRole]      = useState<'caissier' | 'admin'>('caissier')
  const [sending,   setSending]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleSend() {
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, first_name: firstName, role }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Erreur')
      }
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface2)', border: '1px solid var(--border)',
    color: 'var(--text1)', borderRadius: '8px', padding: '8px 12px',
    fontSize: '14px', width: '100%', outline: 'none',
  } as React.CSSProperties

  const labelStyle = {
    display: 'block', fontSize: '12px', fontWeight: 500,
    color: 'var(--text3)', marginBottom: '6px',
  } as React.CSSProperties

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'var(--overlay-bg)' }}>
      <div
        className="relative w-full max-w-sm rounded-xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-base font-semibold text-[var(--text1)] mb-5">Inviter un membre</h2>

        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="caissier@example.com" />
          </div>
          <div>
            <label style={labelStyle}>Prénom *</label>
            <input type="text" style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={50} placeholder="Marie" />
          </div>
          <div>
            <label style={labelStyle}>Rôle</label>
            <div className="flex gap-2">
              {(['admin', 'caissier'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize"
                  style={
                    role === r
                      ? { background: 'var(--blue)', color: 'white', border: '1px solid var(--blue)' }
                      : { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }
                  }
                >
                  {r === 'admin' ? 'Admin' : 'Caissier'} {role === r ? '✓' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-sm mt-3" style={{ color: 'var(--red)' }}>{error}</p>}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}
          >
            Annuler
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !email || !firstName}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{ background: 'var(--blue)', opacity: (sending || !email || !firstName) ? 0.5 : 1 }}
          >
            {sending ? 'Envoi…' : '✉ Envoyer l\'invitation'}
          </button>
        </div>
      </div>
    </div>
  )
}
