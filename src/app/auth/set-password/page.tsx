'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function SetPasswordForm() {
  const searchParams = useSearchParams()
  const isReset = searchParams.get('flow') === 'recovery'

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
    borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Role-aware redirect — use full reload so server picks up fresh session cookies
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role === 'franchise_admin') {
        window.location.href = '/dashboard/franchise/command-center'
        return
      }
    }
    window.location.href = '/dashboard/products'
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md mx-4 p-8 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h1 className="text-2xl font-bold mb-2 text-center text-[var(--text1)]">Alloflow</h1>
        <p className="text-sm text-center text-[var(--text4)] mb-6">
          {isReset
            ? 'Choisissez votre nouveau mot de passe'
            : 'Choisissez votre mot de passe pour activer votre compte'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
              Mot de passe
            </label>
            <input
              type="password"
              style={inputStyle}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="8 caractères minimum"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
              Confirmer
            </label>
            <input
              type="password"
              style={inputStyle}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Répétez le mot de passe"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-2"
            style={{ background: 'var(--blue)', opacity: (loading || !password || !confirm) ? 0.5 : 1 }}
          >
            {loading
              ? (isReset ? 'Réinitialisation…' : 'Activation…')
              : (isReset ? 'Réinitialiser mon mot de passe' : 'Activer mon compte')}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordForm />
    </Suspense>
  )
}
