'use client'

import { useEffect, useState } from 'react'
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

export default function Tasks() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTitle, setNewTitle] = useState('')
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

  async function loadTasks() {
    const { data: orgs } = await supabase.from('organizations').select().limit(1)
    const org = orgs?.[0] ?? null
    setOrganization(org)

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
    return <div style={{ padding: '2rem' }}>Lade...</div>
  }

  if (!session) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>Du musst eingeloggt sein, um Aufgaben zu sehen.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1>Aufgaben{organization ? ` – ${organization.name}` : ''}</h1>

      <form onSubmit={handleAddTask} style={{ margin: '1rem 0', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Neue Aufgabe, z.B. Flyer in Eimsbüttel verteilen"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          required
          style={{ flex: 1, padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Anlegen
        </button>
      </form>

      {message && <p>{message}</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {tasks.map((task) => (
          <li
            key={task.id}
            style={{
              border: '1px solid #ccc',
              borderRadius: '4px',
              padding: '0.75rem',
              marginBottom: '0.5rem',
            }}
          >
            <div>{task.title}</div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Status: {task.status}</div>

            {task.status === 'offen' && (
              <button onClick={() => handleClaim(task.id)} style={{ marginTop: '0.5rem' }}>
                Aufgabe übernehmen
              </button>
            )}

            {task.status === 'in_bearbeitung' && task.assigned_to === session.user.id && (
              <button onClick={() => handleComplete(task.id)} style={{ marginTop: '0.5rem' }}>
                Als erledigt markieren
              </button>
            )}

            {task.status === 'in_bearbeitung' && task.assigned_to !== session.user.id && (
              <div style={{ fontSize: '0.85rem', color: '#666' }}>wird bereits bearbeitet</div>
            )}
          </li>
        ))}
        {tasks.length === 0 && <p>Noch keine Aufgaben.</p>}
      </ul>
    </div>
  )
}
