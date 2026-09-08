'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setMessage('Erfolgreich registriert! Du kannst dich jetzt einloggen.')
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-bold text-foreground">Registrieren</h1>

        <form onSubmit={handleSignUp} className="mt-5 space-y-4">
          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium text-foreground">
              E-Mail
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-foreground">
              Passwort
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Registrieren
          </button>
        </form>

        {message && (
          <p
            role={message.startsWith('Fehler') ? 'alert' : 'status'}
            className={`mt-4 text-sm ${message.startsWith('Fehler') ? 'text-destructive' : 'text-status-erledigt'}`}
          >
            {message}
          </p>
        )}

        <p className="mt-5 text-sm text-muted-foreground">
          Schon registriert?{' '}
          <Link href="/login" className="font-medium text-primary hover:text-primary-hover">
            Einloggen
          </Link>
        </p>
      </div>
    </main>
  )
}
