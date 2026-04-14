'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  email: string
  firstName: string
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}

const labelStyle = 'block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5'

export function AccountForm({ email, firstName: initialFirstName }: Props) {
  const [firstName,    setFirstName]    = useState(initialFirstName)
  const [nameLoading,  setNameLoading]  = useState(false)
  const [nameSuccess,  setNameSuccess]  = useState(false)
  const [nameError,    setNameError]    = useState<string | null>(null)

  const [currentPwd,   setCurrentPwd]   = useState('')
  const [newPwd,       setNewPwd]       = useState('')
  const [confirmPwd,   setConfirmPwd]   = useState('')
  const [pwdLoading,   setPwdLoading]   = useState(false)
  const [pwdSuccess,   setPwdSuccess]   = useState(false)
  const [pwdError,     setPwdError]     = useState<string | null>(null)

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNameLoading(true)
    setNameSuccess(false)
    setNameError(null)

    const res = await fetch('/api/settings/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName.trim() }),
    })

    setNameLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setNameError(data.error ?? 'Erreur lors de la mise à jour')
      return
    }

    setNameSuccess(true)
    setTimeout(() => setNameSuccess(false), 3000)
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPwdError(null)
    setPwdSuccess(false)

    if (newPwd.length < 8) {
      setPwdError('Le nouveau mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('Les mots de passe ne correspondent pas')
      return
    }

    setPwdLoading(true)

    // Re-authenticate with current password first
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPwd })
    if (signInError) {
      setPwdError('Mot de passe actuel incorrect')
      setPwdLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPwd })
    setPwdLoading(false)

    if (updateError) {
      setPwdError(updateError.message)
      return
    }

    setPwdSuccess(true)
    setCurrentPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setTimeout(() => setPwdSuccess(false), 4000)
  }

  return (
    <div className="space-y-10 max-w-xl">
      {/* Email (read-only) */}
      <section>
        <h2 className="text-base font-semibold text-[var(--text1)] mb-4">Informations du compte</h2>
        <div className="p-4 rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <label className={labelStyle}>Email</label>
          <div
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text3)' }}
          >
            {email}
          </div>
          <p className="text-xs text-[var(--text4)] mt-1">L&apos;email ne peut pas être modifié directement. Contactez votre administrateur.</p>
        </div>
      </section>

      {/* First name */}
      <section>
        <h2 className="text-base font-semibold text-[var(--text1)] mb-4">Prénom</h2>
        <form
          onSubmit={handleNameSubmit}
          className="p-4 rounded-lg space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div>
            <label className={labelStyle}>Prénom affiché</label>
            <input
              type="text"
              style={inputStyle}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder="Votre prénom"
              maxLength={50}
            />
          </div>

          {nameError   && <p className="text-sm text-red-400">{nameError}</p>}
          {nameSuccess && <p className="text-sm text-green-400">Prénom mis à jour</p>}

          <button
            type="submit"
            disabled={nameLoading || !firstName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--blue)', opacity: (nameLoading || !firstName.trim()) ? 0.5 : 1 }}
          >
            {nameLoading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </section>

      {/* Password change */}
      <section>
        <h2 className="text-base font-semibold text-[var(--text1)] mb-4">Changer le mot de passe</h2>
        <form
          onSubmit={handlePasswordSubmit}
          className="p-4 rounded-lg space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div>
            <label className={labelStyle}>Mot de passe actuel</label>
            <input
              type="password"
              style={inputStyle}
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className={labelStyle}>Nouveau mot de passe</label>
            <input
              type="password"
              style={inputStyle}
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="8 caractères minimum"
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className={labelStyle}>Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              style={inputStyle}
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Répétez le mot de passe"
              required
              autoComplete="new-password"
            />
          </div>

          {pwdError   && <p className="text-sm text-red-400">{pwdError}</p>}
          {pwdSuccess && <p className="text-sm text-green-400">Mot de passe mis à jour avec succès</p>}

          <button
            type="submit"
            disabled={pwdLoading || !currentPwd || !newPwd || !confirmPwd}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{
              background: 'var(--blue)',
              opacity: (pwdLoading || !currentPwd || !newPwd || !confirmPwd) ? 0.5 : 1,
            }}
          >
            {pwdLoading ? 'Mise à jour…' : 'Changer le mot de passe'}
          </button>
        </form>
      </section>
    </div>
  )
}
