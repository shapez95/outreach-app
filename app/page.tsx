'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Membership = {
  role: string
  organizations: { id: string; name: string } | null
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [totalPoints, setTotalPoints] = useState(0)

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
    if (!session) {
      setMemberships([])
      return
    }
    supabase
      .from('memberships')
      .select('role, organizations(id, name)')
      .eq('profile_id', session.user.id)
      .then(({ data }) => setMemberships((data as unknown as Membership[]) ?? []))

    supabase
      .from('tasks')
      .select('points')
      .eq('assigned_to', session.user.id)
      .eq('status', 'erledigt')
      .then(({ data }) => setTotalPoints((data ?? []).reduce((sum, t) => sum + t.points, 0)))
  }, [session])

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  if (loadingSession) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Lade...</p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900">Outreach App</h1>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          {session ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Eingeloggt als <span className="font-medium text-gray-900">{session.user.email}</span>
              </p>
              <p className="text-sm text-gray-600">
                Deine Punkte: <span className="font-semibold text-emerald-700">{totalPoints}</span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/tasks"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Zu den Aufgaben →
                </Link>
                <Link
                  href="/areas"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Gebiete
                </Link>
                <Link
                  href="/join"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Organisation beitreten
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Ausloggen
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Nicht eingeloggt.</p>
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Einloggen
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Registrieren
                </Link>
              </div>
            </div>
          )}
        </div>

        {session && (
          <>
            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Meine Organisationen
            </h2>
            <ul className="mt-3 space-y-2">
              {memberships.map((m) => (
                <li
                  key={m.organizations?.id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm"
                >
                  <span className="font-medium text-gray-900">{m.organizations?.name}</span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    {m.role === 'organizer' ? 'Organisator' : 'Helfer'}
                  </span>
                </li>
              ))}
              {memberships.length === 0 && (
                <li className="text-sm text-gray-500">
                  Du bist noch keiner Organisation beigetreten.{' '}
                  <Link href="/join" className="font-medium text-indigo-600 hover:text-indigo-700">
                    Jetzt beitreten
                  </Link>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}
