'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [totalPoints, setTotalPoints] = useState(0)
  const [tasksDone, setTasksDone] = useState(0)
  const [conversationsHeld, setConversationsHeld] = useState(0)

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
    if (!session) return

    supabase
      .from('tasks')
      .select('points, conversation_count')
      .eq('assigned_to', session.user.id)
      .eq('status', 'erledigt')
      .then(({ data }) => {
        const rows = data ?? []
        setTotalPoints(rows.reduce((sum, t) => sum + t.points, 0))
        setTasksDone(rows.length)
        setConversationsHeld(rows.reduce((sum, t) => sum + t.conversation_count, 0))
      })
  }, [session])

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

              <div className="rounded-xl bg-teal-50 p-4">
                <p className="text-xs text-teal-800">
                  Deine Punkte zeigen deinen persönlichen Fortschritt – kein Ranking, nur du vs. du.
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-teal-700">{totalPoints}</span>
                  <span className="text-sm text-teal-800">Punkte</span>
                </div>
                <p className="mt-1 text-xs text-teal-800">
                  {tasksDone} Aufgabe{tasksDone === 1 ? '' : 'n'} erledigt · {conversationsHeld} Gespräch
                  {conversationsHeld === 1 ? '' : 'e'} geführt
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Nicht eingeloggt.</p>
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
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
      </div>
    </main>
  )
}
