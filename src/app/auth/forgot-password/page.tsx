'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
    borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-md mx-4 p-8 rounded-xl text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-bold text-[var(--text1)] mb-2">Email envoyé</h2>
          <p className="text-sm text-[var(--text3)] mb-6">
            Si un compte existe avec cet email, vous recevrez un lien pour réinitialiser votre mot de passe.
          </p>
          <Link href="/login" className="text-sm" style={{ color: 'var(--blue)' }}>
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md mx-4 p-8 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h1 className="text-2xl font-bold mb-2 text-center text-[var(--text1)]">Alloflow</h1>
        <p className="text-sm text-center text-[var(--text4)] mb-6">
          Saisissez votre email pour recevoir un lien de réinitialisation
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
              Email
            </label>
            <input
              type="email"
              style={inputStyle}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white mt-2"
            style={{ background: 'var(--blue)', opacity: (loading || !email) ? 0.5 : 1 }}
          >
            {loading ? 'Envoi…' : 'Envoyer le lien'}
          </button>

          <Link
            href="/login"
            className="text-center text-xs mt-1"
            style={{ color: 'var(--text4)' }}
          >
            ← Retour à la connexion
          </Link>
        </form>
      </div>
    </div>
  )
}
