'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Organization = {
  id: string
  name: string
}

type Membership = {
  role: string
  organizations: Organization | null
}

type OrgMember = {
  profile_id: string
  email: string
  role: string
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [totalPoints, setTotalPoints] = useState(0)
  const [tasksDone, setTasksDone] = useState(0)
  const [conversationsHeld, setConversationsHeld] = useState(0)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])
  const [issueMemberId, setIssueMemberId] = useState('')
  const [issueAmount, setIssueAmount] = useState('')
  const [issueMessage, setIssueMessage] = useState('')

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

    loadOrgAndMembers()
  }, [session])

  async function loadOrgAndMembers() {
    if (!session) return

    const { data: membershipData } = await supabase
      .from('memberships')
      .select('role, organizations(id, name)')
      .eq('profile_id', session.user.id)
      .order('created_at', { ascending: true })

    const allMemberships = (membershipData as unknown as Membership[]) ?? []
    const savedOrgId = typeof window !== 'undefined' ? localStorage.getItem('currentOrgId') : null
    const membership =
      allMemberships.find((m) => m.organizations?.id === savedOrgId) ?? allMemberships[0] ?? null
    const org = membership?.organizations ?? null
    setOrganization(org)
    setRole(membership?.role ?? null)

    if (org && membership?.role === 'organizer') {
      const { data: memberData } = await supabase
        .from('memberships')
        .select('profile_id, role, profiles(email)')
        .eq('org_id', org.id)
      setOrgMembers(
        ((memberData ?? []) as unknown as { profile_id: string; role: string; profiles: { email: string } | null }[]).map(
          (m) => ({ profile_id: m.profile_id, role: m.role, email: m.profiles?.email ?? '' })
        )
      )
    }
  }

  async function handleIssueFlyers(e: React.FormEvent) {
    e.preventDefault()
    if (!organization || !issueMemberId || !issueAmount) return

    const { error } = await supabase.from('flyer_issuances').insert({
      org_id: organization.id,
      profile_id: issueMemberId,
      amount: Number(issueAmount),
      issued_by: session?.user.id,
    })

    if (error) {
      setIssueMessage('Fehler: ' + error.message)
    } else {
      setIssueMemberId('')
      setIssueAmount('')
      setIssueMessage('Flyer wurden ausgegeben.')
    }
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

              {role === 'organizer' && (
                <div>
                  <form onSubmit={handleIssueFlyers} className="flex gap-2">
                    <select
                      value={issueMemberId}
                      onChange={(e) => setIssueMemberId(e.target.value)}
                      required
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">Flyer ausgeben an...</option>
                      {orgMembers.map((m) => (
                        <option key={m.profile_id} value={m.profile_id}>
                          {m.email} ({m.role === 'organizer' ? 'Organisator' : 'Helfer'})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      placeholder="Anzahl"
                      value={issueAmount}
                      onChange={(e) => setIssueAmount(e.target.value)}
                      required
                      className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
                    >
                      Ausgeben
                    </button>
                  </form>
                  {issueMessage && (
                    <p
                      className={`mt-1 text-xs ${issueMessage.startsWith('Fehler') ? 'text-red-600' : 'text-emerald-600'}`}
                    >
                      {issueMessage}
                    </p>
                  )}
                </div>
              )}
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
