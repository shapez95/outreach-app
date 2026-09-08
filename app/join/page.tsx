'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export default function Join() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [newOrgName, setNewOrgName] = useState('')
  const [createMessage, setCreateMessage] = useState('')
  const [createdCode, setCreatedCode] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })
  }, [])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('join_organization_with_code', {
      invite_code_input: code,
    })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault()
    const { data, error } = await supabase.rpc('create_organization', { org_name: newOrgName })

    if (error) {
      setCreateMessage('Fehler: ' + error.message)
    } else {
      setCreatedCode(data?.[0]?.invite_code ?? null)
    }
  }

  if (loadingSession) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Lade...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">Du musst eingeloggt sein, um einer Organisation beizutreten.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Zum Login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-bold text-foreground">Organisation beitreten</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gib den Einladungscode ein, den du von deinem Organisator bekommen hast.
        </p>

        <form onSubmit={handleJoin} className="mt-5 space-y-4">
          <div>
            <label htmlFor="join-code" className="block text-sm font-medium text-foreground">
              Einladungscode
            </label>
            <input
              id="join-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm uppercase focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Beitreten
          </button>
        </form>

        {message && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {message}
          </p>
        )}
      </div>

      <div className="mt-6 w-full max-w-sm rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground">Neue Organisation gründen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Du wirst automatisch Organisator und bekommst einen Einladungscode zum Weitergeben.
        </p>

        {createdCode ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-foreground">
              Organisation gegründet! Dein Einladungscode:
            </p>
            <p className="rounded-lg bg-muted px-3 py-2 text-center font-mono text-lg font-semibold tracking-wider text-foreground">
              {createdCode}
            </p>
            <Link
              href="/"
              className="block rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              Weiter zur Startseite
            </Link>
          </div>
        ) : (
          <form onSubmit={handleCreateOrg} className="mt-4 space-y-4">
            <div>
              <label htmlFor="org-name" className="block text-sm font-medium text-foreground">
                Name der Organisation
              </label>
              <input
                id="org-name"
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Gründen
            </button>
          </form>
        )}

        {createMessage && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {createMessage}
          </p>
        )}
      </div>
    </main>
  )
}
