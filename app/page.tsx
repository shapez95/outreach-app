'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [organizations, setOrganizations] = useState<unknown[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    supabase
      .from('organizations')
      .select()
      .then(({ data }) => setOrganizations(data ?? []))
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loadingSession) {
    return <div style={{ padding: '2rem' }}>Lade...</div>
  }

  return (
    <div style={{ padding: '2rem' }}>
      {session ? (
        <div style={{ marginBottom: '1rem' }}>
          <p>Eingeloggt als {session.user.email}</p>
          <button onClick={handleLogout} style={{ padding: '0.5rem 1rem' }}>
            Ausloggen
          </button>
          <p style={{ marginTop: '1rem' }}>
            <Link href="/tasks">Zu den Aufgaben →</Link>
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          <p>Nicht eingeloggt.</p>
          <Link href="/login">Einloggen</Link> | <Link href="/signup">Registrieren</Link>
        </div>
      )}

      <h1>Meine Organisationen</h1>
      <pre>{JSON.stringify(organizations, null, 2)}</pre>
    </div>
  )
}
