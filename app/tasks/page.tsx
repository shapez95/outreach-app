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
  proof_path: string | null
  created_at: string
}

type Organization = {
  id: string
  name: string
}

const STATUS_LABELS: Record<string, string> = {
  vorschlag: 'Vorschlag – wartet auf Freigabe',
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  zur_pruefung: 'Zur Prüfung eingereicht',
  erledigt: 'Bestätigt',
}

const STATUS_STYLES: Record<string, string> = {
  vorschlag: 'bg-purple-100 text-purple-800',
  offen: 'bg-gray-100 text-gray-700',
  in_bearbeitung: 'bg-amber-100 text-amber-800',
  zur_pruefung: 'bg-blue-100 text-blue-800',
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
  const [role, setRole] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [newTitle, setNewTitle] = useState('')
  const [message, setMessage] = useState('')
  const [orgChecked, setOrgChecked] = useState(false)
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null)

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
      .select('role, organizations(id, name)')
      .eq('profile_id', session.session.user.id)
      .limit(1)

    const membership = memberships?.[0] ?? null
    const org = (membership?.organizations as unknown as Organization) ?? null
    setOrganization(org)
    setRole(membership?.role ?? null)
    setOrgChecked(true)

    if (org) {
      const { data } = await supabase
        .from('tasks')
        .select()
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
      const loadedTasks = data ?? []
      setTasks(loadedTasks)

      const withProof = loadedTasks.filter((t) => t.proof_path)
      const entries = await Promise.all(
        withProof.map(async (t) => {
          const { data: signed } = await supabase.storage
            .from('task-proofs')
            .createSignedUrl(t.proof_path as string, 3600)
          return [t.id, signed?.signedUrl ?? null] as const
        })
      )
      setPhotoUrls(Object.fromEntries(entries.filter(([, url]) => url)) as Record<string, string>)
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

  async function updateTask(
    taskId: string,
    changes: Partial<Pick<Task, 'status' | 'assigned_to' | 'proof_path'>>
  ) {
    const { error } = await supabase.from('tasks').update(changes).eq('id', taskId)

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      loadTasks()
    }
  }

  function handleApprove(taskId: string) {
    updateTask(taskId, { status: 'offen' })
  }

  async function handleRejectProposal(taskId: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      loadTasks()
    }
  }

  function handleClaim(taskId: string) {
    if (!session) return
    updateTask(taskId, { status: 'in_bearbeitung', assigned_to: session.user.id })
  }

  async function handleSubmitForReview(e: React.FormEvent<HTMLFormElement>, task: Task) {
    e.preventDefault()
    if (!organization) return

    const fileInput = e.currentTarget.elements.namedItem('photo') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file) return

    setUploadingTaskId(task.id)
    setMessage('')

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${organization.id}/${task.id}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from('task-proofs').upload(path, file)

    if (uploadError) {
      setMessage('Fehler beim Hochladen: ' + uploadError.message)
      setUploadingTaskId(null)
      return
    }

    await updateTask(task.id, { status: 'zur_pruefung', proof_path: path })
    setUploadingTaskId(null)
  }

  function handleConfirm(taskId: string) {
    updateTask(taskId, { status: 'erledigt' })
  }

  function handleReject(taskId: string) {
    updateTask(taskId, { status: 'in_bearbeitung' })
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

              {task.status === 'vorschlag' && role === 'organizer' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleApprove(task.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Freigeben
                  </button>
                  <button
                    onClick={() => handleRejectProposal(task.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Ablehnen
                  </button>
                </div>
              )}

              {task.status === 'vorschlag' && role !== 'organizer' && (
                <p className="mt-3 text-sm text-gray-500">Wartet auf Freigabe durch den Organisator</p>
              )}

              {task.status === 'offen' && (
                <button
                  onClick={() => handleClaim(task.id)}
                  className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Aufgabe übernehmen
                </button>
              )}

              {task.status === 'in_bearbeitung' && task.assigned_to === session.user.id && (
                <form
                  onSubmit={(e) => handleSubmitForReview(e, task)}
                  className="mt-3 space-y-2"
                >
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    required
                    className="block w-full text-sm text-gray-600"
                  />
                  <button
                    type="submit"
                    disabled={uploadingTaskId === task.id}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploadingTaskId === task.id ? 'Wird hochgeladen...' : 'Foto hochladen & einreichen'}
                  </button>
                </form>
              )}

              {task.status === 'in_bearbeitung' && task.assigned_to !== session.user.id && (
                <p className="mt-3 text-sm text-gray-500">wird bereits bearbeitet</p>
              )}

              {(task.status === 'zur_pruefung' || task.status === 'erledigt') && photoUrls[task.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[task.id]}
                  alt="Nachweis-Foto"
                  className="mt-3 max-h-64 w-full rounded-lg object-cover"
                />
              )}

              {task.status === 'zur_pruefung' && role === 'organizer' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleConfirm(task.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Bestätigen
                  </button>
                  <button
                    onClick={() => handleReject(task.id)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Ablehnen
                  </button>
                </div>
              )}

              {task.status === 'zur_pruefung' && role !== 'organizer' && (
                <p className="mt-3 text-sm text-gray-500">Wartet auf Bestätigung durch den Organisator</p>
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
