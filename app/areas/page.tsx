'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const MapView = dynamic(() => import('../map/MapView'), { ssr: false })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const AREA_COLORS = ['#0d9488', '#c2410c', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f']

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    )
    const results = await res.json()
    const first = results?.[0]
    if (!first) return null
    return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) }
  } catch {
    return null
  }
}

type Organization = {
  id: string
  name: string
}

type Area = {
  id: string
  org_id: string
  name: string
  boundary: object | null
  created_at: string
}

type AreaSearchResult = {
  display_name: string
  name: string
  geojson: object
}

type Task = {
  id: string
  title: string
  area_id: string | null
  status: string
  address: string | null
  lat: number | null
  lng: number | null
}

type Membership = {
  role: string
  organizations: Organization | null
}

export default function Areas() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [orgChecked, setOrgChecked] = useState(false)
  const [areas, setAreas] = useState<Area[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [areaQuery, setAreaQuery] = useState('')
  const [areaSearchResults, setAreaSearchResults] = useState<AreaSearchResult[]>([])
  const [searchingArea, setSearchingArea] = useState(false)
  const [message, setMessage] = useState('')
  const [backfilling, setBackfilling] = useState(false)

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
        .select('id, title, area_id, status, address, lat, lng')
        .eq('org_id', org.id)
      setTasks(taskData ?? [])
    }
  }

  useEffect(() => {
    loadAreas()
  }, [])

  async function handleSearchArea(e: React.FormEvent) {
    e.preventDefault()
    setSearchingArea(true)
    setMessage('')
    setAreaSearchResults([])

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&addressdetails=1&limit=8&q=${encodeURIComponent(areaQuery)}`
      )
      const results = await res.json()
      const filtered = (results ?? []).filter(
        (r: { class: string; type: string; geojson?: object }) =>
          r.geojson &&
          (r.class === 'boundary' ||
            ['suburb', 'city_district', 'borough', 'neighbourhood', 'quarter'].includes(r.type))
      )
      setAreaSearchResults(
        filtered.map((r: { display_name: string; name: string; geojson: object }) => ({
          display_name: r.display_name,
          name: r.name,
          geojson: r.geojson,
        }))
      )
      if (filtered.length === 0) {
        setMessage('Keine Stadtteile/Bezirke gefunden. Versuch eine genauere Suche, z.B. "Eimsbüttel Hamburg".')
      }
    } catch {
      setMessage('Fehler bei der Suche. Bitte nochmal versuchen.')
    }
    setSearchingArea(false)
  }

  async function handleSelectAreaResult(result: AreaSearchResult) {
    if (!organization) return
    if (areas.some((a) => a.name.toLowerCase() === result.name.toLowerCase())) {
      setMessage(`Fehler: Das Gebiet "${result.name}" existiert für diese Organisation schon.`)
      return
    }

    const { error } = await supabase
      .from('areas')
      .insert({ org_id: organization.id, name: result.name, boundary: result.geojson })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setAreaQuery('')
      setAreaSearchResults([])
      loadAreas()
    }
  }

  function handleOpenAreaTasks(areaId: string) {
    localStorage.setItem('currentAreaId', areaId)
    router.push('/tasks')
  }

  async function handleDeleteArea(areaId: string) {
    if (!window.confirm('Gebiet wirklich löschen? Alle Aufgaben dieses Gebiets werden dabei ebenfalls gelöscht.')) {
      return
    }

    const { error } = await supabase.from('areas').delete().eq('id', areaId)

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      loadAreas()
    }
  }

  async function handleBackfillCoordinates() {
    const missing = tasks.filter((t) => t.address && t.lat == null)
    if (missing.length === 0) return

    setBackfilling(true)
    setMessage('')
    for (const task of missing) {
      const coords = await geocodeAddress(task.address as string)
      if (coords) {
        await supabase.from('tasks').update({ lat: coords.lat, lng: coords.lng }).eq('id', task.id)
      }
      await sleep(1100)
    }
    setBackfilling(false)
    loadAreas()
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

  const withCoords = tasks.filter((t) => t.lat != null && t.lng != null)
  const missingCoords = tasks.filter((t) => t.address && t.lat == null)

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Gebiete & Karte{organization ? ` – ${organization.name}` : ''}
          </h1>
          <Link href="/tasks" className="text-sm font-medium text-teal-600 hover:text-teal-700">
            Zu den Aufgaben →
          </Link>
        </div>

        {withCoords.length > 0 ? (
          <div className="mt-4 h-72 overflow-hidden rounded-2xl border border-gray-200">
            <MapView tasks={withCoords} areas={areas} />
          </div>
        ) : null}

        {areas.some((a) => a.boundary) && (
          <div className="mt-2 flex flex-wrap gap-3">
            {areas
              .filter((a) => a.boundary)
              .map((a, i) => (
                <span key={a.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: AREA_COLORS[i % AREA_COLORS.length] }}
                  />
                  {a.name}
                </span>
              ))}
          </div>
        )}

        {withCoords.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">
            Noch keine Aufgaben mit Koordinaten. Sobald Aufgaben eine Adresse haben, erscheinen sie hier als Pins.
          </p>
        )}

        {role === 'organizer' && missingCoords.length > 0 && (
          <button
            onClick={handleBackfillCoordinates}
            disabled={backfilling}
            className="mt-2 text-xs font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
          >
            {backfilling
              ? `Koordinaten werden ermittelt... (${missingCoords.length})`
              : `Koordinaten für ${missingCoords.length} ältere Aufgabe${missingCoords.length === 1 ? '' : 'n'} nachträglich ermitteln`}
          </button>
        )}

        {role === 'organizer' && (
          <div className="mt-5">
            <p className="text-xs text-gray-500">
              Neues Gebiet hinzufügen. Aufgaben mit diesem Gebiet können nur innerhalb seiner Grenzen
              angelegt werden.
            </p>
            <form onSubmit={handleSearchArea} className="mt-2 flex gap-2">
              <input
                type="text"
                placeholder="Stadtteil/Bezirk suchen, z.B. Eimsbüttel Hamburg"
                value={areaQuery}
                onChange={(e) => setAreaQuery(e.target.value)}
                required
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={searchingArea}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {searchingArea ? 'Suche...' : 'Suchen'}
              </button>
            </form>

            {areaSearchResults.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-lg border border-gray-200 bg-white p-2">
                {areaSearchResults.map((result, i) => (
                  <li key={i}>
                    <button
                      onClick={() => handleSelectAreaResult(result)}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {result.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-teal-300"
              >
                <button
                  onClick={() => handleOpenAreaTasks(area.id)}
                  className="block w-full text-left"
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
                </button>
                {role === 'organizer' && (
                  <button
                    onClick={() => handleDeleteArea(area.id)}
                    className="mt-2 text-xs font-medium text-gray-400 hover:text-red-600"
                  >
                    Löschen
                  </button>
                )}
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
