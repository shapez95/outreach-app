'use client'

import { useState } from 'react'
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
    <div style={{ padding: '2rem', maxWidth: '400px' }}>
      <h1>Registrieren</h1>
      <form onSubmit={handleSignUp}>
        <div style={{ marginBottom: '1rem' }}>
          <label>E-Mail</label><br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label>Passwort</label><br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
        </div>
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Registrieren
        </button>
      </form>
      {message && <p>{message}</p>}
    </div>
  )
}