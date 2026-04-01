'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const unauthorized = searchParams.get('error') === 'unauthorized'
  const noEstablishment = searchParams.get('error') === 'no_establishment'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    // Role-aware redirect
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profileError) {
      // Fall back to products on profile fetch failure
      setLoading(false)
      router.push('/dashboard/products')
      router.refresh()
      return
    }

    setLoading(false)
    if (profile?.role === 'franchise_admin') {
      router.push('/dashboard/franchise/command-center')
    } else {
      router.push('/dashboard/products')
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md mx-4 p-4 sm:p-8 rounded-xl border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
        <h1 className="text-2xl font-bold mb-6 text-center text-[var(--text1)]">Alloflow</h1>

        {unauthorized && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', color: 'var(--red)' }}>
            Accès non autorisé. Contactez votre administrateur.
          </div>
        )}

        {noEstablishment && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', color: 'var(--red)' }}>
            Votre compte n&apos;est pas rattaché à un établissement. Contactez votre administrateur.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </Button>

          <p className="text-center text-xs mt-2" style={{ color: 'var(--text4)' }}>
            Vous êtes franchiseur ?{' '}
            <a href="/register" style={{ color: 'var(--blue)' }}>
              Créer votre réseau →
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
