'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Organization = {
  id: string
  name: string
}

type Area = {
  id: string
  org_id: string
  name: string
  created_at: string
}

type Task = {
  id: string
  area_id: string | null
  status: string
}

type Membership = {
  role: string
  organizations: Organization | null
}

export default function Areas() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [orgChecked, setOrgChecked] = useState(false)
  const [areas, setAreas] = useState<Area[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [newAreaName, setNewAreaName] = useState('')
  const [message, setMessage] = useState('')

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

  async function loadAreas() {
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return

    const { data: membershipData } = await supabase
      .from('memberships')
      .select('role, organizations(id, name)')
      .eq('profile_id', session.session.user.id)
      .order('created_at', { ascending: true })

    const allMemberships = (membershipData as unknown as Membership[]) ?? []

    const savedOrgId = typeof window !== 'undefined' ? localStorage.getItem('currentOrgId') : null
    const membership =
      allMemberships.find((m) => m.organizations?.id === savedOrgId) ?? allMemberships[0] ?? null
    const org = membership?.organizations ?? null
    setOrganization(org)
    setRole(membership?.role ?? null)
    setOrgChecked(true)

    if (org) {
      const { data: areaData } = await supabase
        .from('areas')
        .select()
        .eq('org_id', org.id)
        .order('created_at', { ascending: true })
      setAreas(areaData ?? [])

      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, area_id, status')
        .eq('org_id', org.id)
      setTasks(taskData ?? [])
    }
  }

  useEffect(() => {
    loadAreas()
  }, [])

  async function handleAddArea(e: React.FormEvent) {
    e.preventDefault()
    if (!organization) return

    const { error } = await supabase
      .from('areas')
      .insert({ org_id: organization.id, name: newAreaName })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setNewAreaName('')
      loadAreas()
    }
  }

  if (loadingSession) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">Lade...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-600">Du musst eingeloggt sein, um Gebiete zu sehen.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Zum Login
          </Link>
        </div>
      </main>
    )
  }

  if (orgChecked && !organization) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-gray-600">
            Du bist noch keiner Organisation beigetreten. Frag deinen Organisator nach dem Einladungscode.
          </p>
          <Link
            href="/join"
            className="mt-4 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Organisation beitreten
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Gebiete{organization ? ` – ${organization.name}` : ''}
          </h1>
          <Link href="/tasks" className="text-sm font-medium text-teal-600 hover:text-teal-700">
            Zu den Aufgaben →
          </Link>
        </div>

        {role === 'organizer' && (
          <form onSubmit={handleAddArea} className="mt-5 flex gap-2">
            <input
              type="text"
              placeholder="Neues Gebiet, z.B. Eimsbüttel"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              required
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              Anlegen
            </button>
          </form>
        )}

        {message && <p className="mt-3 text-sm text-red-600">{message}</p>}

        <ul className="mt-6 space-y-3">
          {areas.map((area) => {
            const areaTasks = tasks.filter((t) => t.area_id === area.id)
            const done = areaTasks.filter((t) => t.status === 'erledigt').length
            const total = areaTasks.length
            const percent = total > 0 ? Math.round((done / total) * 100) : 0

            return (
              <li
                key={area.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{area.name}</p>
                  <span className="text-sm text-gray-600">
                    {done}/{total} erledigt
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            )
          })}
          {areas.length === 0 && (
            <li className="text-sm text-gray-500">
              Noch keine Gebiete{role === 'organizer' ? ' – leg oben das erste an.' : '.'}
            </li>
          )}
        </ul>
      </div>
    </main>
  )
}
