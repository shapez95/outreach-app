'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type Task = {
  id: string
  org_id: string
  title: string
  status: string
  assigned_to: string | null
  created_at: string
}

type Organization = {
  id: string
  name: string
}

const STATUS_LABELS: Record<string, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
}

const STATUS_STYLES: Record<string, string> = {
  offen: 'bg-gray-100 text-gray-700',
  in_bearbeitung: 'bg-amber-100 text-amber-800',
  erledigt: 'bg-emerald-100 text-emerald-800',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export default function Tasks() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [message, setMessage] = useState('')
  const [orgChecked, setOrgChecked] = useState(false)

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

  async function loadTasks() {
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return

    const { data: memberships } = await supabase
      .from('memberships')
      .select('organizations(id, name)')
      .eq('profile_id', session.session.user.id)
      .limit(1)

    const org = (memberships?.[0]?.organizations as unknown as Organization) ?? null
    setOrganization(org)
    setOrgChecked(true)

    if (org) {
      const { data } = await supabase
        .from('tasks')
        .select()
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
      setTasks(data ?? [])
    }
  }

  useEffect(() => {
    loadTasks()
  }, [])

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!organization) return

    const { error } = await supabase
      .from('tasks')
      .insert({ org_id: organization.id, title: newTitle })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setNewTitle('')
      loadTasks()
    }
  }

  async function handleClaim(taskId: string) {
    if (!session) return
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'in_bearbeitung', assigned_to: session.user.id })
      .eq('id', taskId)

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      loadTasks()
    }
  }

  async function handleComplete(taskId: string) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'erledigt' })
      .eq('id', taskId)

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      loadTasks()
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
          <p className="text-sm text-gray-600">Du musst eingeloggt sein, um Aufgaben zu sehen.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
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
            Aufgaben{organization ? ` – ${organization.name}` : ''}
          </h1>
          <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            ← Zurück
          </Link>
        </div>

        <form onSubmit={handleAddTask} className="mt-5 flex gap-2">
          <input
            type="text"
            placeholder="Neue Aufgabe, z.B. Flyer in Eimsbüttel verteilen"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Anlegen
          </button>
        </form>

        {message && <p className="mt-3 text-sm text-red-600">{message}</p>}

        <ul className="mt-6 space-y-3">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-gray-900">{task.title}</p>
                <StatusBadge status={task.status} />
              </div>

              {task.status === 'offen' && (
                <button
                  onClick={() => handleClaim(task.id)}
                  className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Aufgabe übernehmen
                </button>
              )}

              {task.status === 'in_bearbeitung' && task.assigned_to === session.user.id && (
                <button
                  onClick={() => handleComplete(task.id)}
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Als erledigt markieren
                </button>
              )}

              {task.status === 'in_bearbeitung' && task.assigned_to !== session.user.id && (
                <p className="mt-3 text-sm text-gray-500">wird bereits bearbeitet</p>
              )}
            </li>
          ))}
          {tasks.length === 0 && (
            <li className="text-sm text-gray-500">Noch keine Aufgaben.</li>
          )}
        </ul>
      </div>
    </main>
  )
}
