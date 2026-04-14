'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function RegisterPage() {
  const [networkName, setNetworkName] = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [error,       setError]       = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [signInFailed, setSignInFailed] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSignInFailed(false)

    // 1. Create org + user via API
    let res: Response
    try {
      res = await fetch('/api/auth/register-franchise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ networkName, email, password }),
      })
    } catch {
      setError('Erreur lors de la création du compte')
      setLoading(false)
      return
    }

    if (!res.ok) {
      if (res.status === 409) {
        setError('Un compte existe déjà avec cet email')
      } else if (res.status === 422) {
        setError('Vérifiez les informations saisies')
      } else if (res.status === 429) {
        setError('Trop de tentatives. Réessayez dans une minute.')
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erreur lors de la création du compte')
      }
      setLoading(false)
      return
    }

    // 2. Sign in
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setSignInFailed(true)
      setLoading(false)
      return
    }

    // 3. Full page reload so server SSR receives fresh session cookies
    window.location.href = '/dashboard/franchise/command-center'
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md p-8 rounded-xl border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
        <h1 className="text-2xl font-bold mb-2 text-center text-[var(--text1)]">Alloflow</h1>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--text4)' }}>
          Créer votre réseau franchiseur
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="networkName">Nom du réseau</Label>
            <Input
              id="networkName"
              type="text"
              value={networkName}
              onChange={(e) => setNetworkName(e.target.value)}
              required
              minLength={2}
              maxLength={80}
              placeholder="Ex : Allocookie Paris"
              autoComplete="organization"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
          )}

          {signInFailed && (
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              Compte créé.{' '}
              <a href="/login" style={{ color: 'var(--blue)' }}>
                Connectez-vous →
              </a>
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Création en cours…' : 'Créer mon réseau'}
          </Button>

          <p className="text-center text-xs mt-2" style={{ color: 'var(--text4)' }}>
            Déjà un compte ?{' '}
            <a href="/login" style={{ color: 'var(--blue)' }}>
              Se connecter →
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}
