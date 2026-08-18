'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import type { Geometry } from 'geojson'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import {
  sleep,
  geocodeAddress,
  normalizeAddress,
  isWithinArea,
  CATEGORY_LABELS,
  BRAND_SUGGESTIONS,
  MAX_HOUSEHOLDS_PER_BUNDLE,
} from '@/lib/geo'

type Organization = {
  id: string
  name: string
}

type Membership = {
  role: string
  organizations: Organization | null
}

type Area = {
  id: string
  name: string
  boundary: Geometry | null
}

type Task = {
  id: string
  address: string | null
}

export default function NewTask() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [orgChecked, setOrgChecked] = useState(false)
  const [areas, setAreas] = useState<Area[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [newAreaId, setNewAreaId] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [bulkAreaId, setBulkAreaId] = useState('')
  const [bulkCategory, setBulkCategory] = useState('privathaushalt')
  const [bulkAddresses, setBulkAddresses] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [excelSubmitting, setExcelSubmitting] = useState(false)
  const [excelProgress, setExcelProgress] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })
  }, [])

  async function loadData() {
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
        .select('id, name, boundary')
        .eq('org_id', org.id)
        .order('name', { ascending: true })
      setAreas(areaData ?? [])

      const savedAreaId = typeof window !== 'undefined' ? localStorage.getItem('currentAreaId') : null
      if (savedAreaId) setNewAreaId(savedAreaId)

      const { data } = await supabase.from('tasks').select('id, address').eq('org_id', org.id)
      setTasks(data ?? [])
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault()
    if (!organization) return

    if (tasks.some((t) => t.address && normalizeAddress(t.address) === normalizeAddress(newAddress))) {
      setMessage(`Fehler: Es gibt bereits eine Aufgabe mit der Adresse "${newAddress}".`)
      return
    }

    const selectedArea = areas.find((a) => a.id === newAreaId)
    const coords = await geocodeAddress(newAddress)

    if (selectedArea?.boundary) {
      if (!coords) {
        setMessage(`Fehler: Adresse "${newAddress}" konnte nicht gefunden werden. Bitte prüfen.`)
        return
      }
      if (!isWithinArea(selectedArea, coords.lat, coords.lng)) {
        setMessage(`Fehler: Die Adresse liegt außerhalb des Gebiets "${selectedArea.name}".`)
        return
      }
    }

    const { error } = await supabase.from('tasks').insert({
      org_id: organization.id,
      title: newAddress,
      area_id: newAreaId || null,
      address: newAddress,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      status: role === 'organizer' ? 'offen' : 'vorschlag',
    })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setMessage(`"${newAddress}" wurde angelegt.`)
      setNewAddress('')
      loadData()
    }
  }

  async function handleBulkCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!organization) return

    const entries = bulkAddresses
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [first, ...rest] = line.split(',')
        const address = rest.length > 0 ? rest.join(',').trim() : first.trim()
        const name = rest.length > 0 ? first.trim() : null
        return { name, address }
      })
    if (entries.length === 0) return

    const existingAddresses = new Set(
      tasks.filter((t) => t.address).map((t) => normalizeAddress(t.address as string))
    )
    const seenInThisBatch = new Set<string>()
    for (const entry of entries) {
      const normalized = normalizeAddress(entry.address)
      if (existingAddresses.has(normalized) || seenInThisBatch.has(normalized)) {
        setMessage(`Fehler: Adresse "${entry.address}" gibt es schon (doppelt). Keine der Aufgaben wurde angelegt.`)
        return
      }
      seenInThisBatch.add(normalized)
    }

    if (bulkCategory !== 'privathaushalt' && entries.some((e) => !e.name)) {
      setMessage(
        'Fehler: Bitte bei jeder Zeile einen Namen angeben (Format "Name, Adresse") – nur bei Privathaushalt sind reine Adressen erlaubt.'
      )
      return
    }

    const categoryLabel = CATEGORY_LABELS[bulkCategory] ?? bulkCategory
    const areaName = areas.find((a) => a.id === bulkAreaId)?.name

    let rows: {
      org_id: string
      title: string
      address: string
      address_list: string | null
      area_id: string | null
      category: string
      status: string
      lat?: number | null
      lng?: number | null
    }[]

    if (bulkCategory === 'privathaushalt') {
      const chunks: { name: string | null; address: string }[][] = []
      for (let i = 0; i < entries.length; i += MAX_HOUSEHOLDS_PER_BUNDLE) {
        chunks.push(entries.slice(i, i + MAX_HOUSEHOLDS_PER_BUNDLE))
      }
      rows = chunks.map((chunk) => ({
        org_id: organization.id,
        title: `${chunk.length} Privathaushalte${areaName ? ` in ${areaName}` : ''}`,
        address: chunk[0].address,
        address_list: chunk.map((c) => c.address).join('; '),
        area_id: bulkAreaId || null,
        category: bulkCategory,
        status: 'offen',
      }))
    } else {
      rows = entries.map(({ name, address }) => ({
        org_id: organization.id,
        title: name ?? `${categoryLabel}: ${address}`,
        address,
        address_list: null,
        area_id: bulkAreaId || null,
        category: bulkCategory,
        status: 'offen',
      }))
    }

    const selectedArea = areas.find((a) => a.id === bulkAreaId)

    setBulkSubmitting(true)
    setMessage('')
    for (const row of rows) {
      const coords = await geocodeAddress(row.address)

      if (selectedArea?.boundary) {
        if (!coords) {
          setMessage(`Fehler: Adresse "${row.address}" konnte nicht gefunden werden. Bitte prüfen.`)
          setBulkSubmitting(false)
          return
        }
        if (!isWithinArea(selectedArea, coords.lat, coords.lng)) {
          setMessage(`Fehler: "${row.address}" liegt außerhalb des Gebiets "${selectedArea.name}". Keine der Aufgaben wurde angelegt.`)
          setBulkSubmitting(false)
          return
        }
      }

      row.lat = coords?.lat ?? null
      row.lng = coords?.lng ?? null
      await sleep(1100)
    }

    const { error } = await supabase.from('tasks').insert(rows)
    setBulkSubmitting(false)

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      setMessage(`${rows.length} Aufgabe${rows.length === 1 ? '' : 'n'} angelegt.`)
      setBulkAddresses('')
      setBulkOpen(false)
      loadData()
    }
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !organization) return

    setExcelSubmitting(true)
    setMessage('')
    setExcelProgress('Datei wird gelesen...')

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    function findValue(row: Record<string, string>, keys: string[]): string {
      for (const key of Object.keys(row)) {
        if (keys.includes(key.trim().toLowerCase())) return String(row[key]).trim()
      }
      return ''
    }

    const rowsToInsert: {
      org_id: string
      title: string
      address: string
      area_id: string
      category: string
      status: string
      lat: number | null
      lng: number | null
    }[] = []
    const skipped: string[] = []
    const existingAddresses = new Set(
      tasks.filter((t) => t.address).map((t) => normalizeAddress(t.address as string))
    )

    const areasWithBoundary = areas.filter((a) => a.boundary)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowLabel = `Zeile ${i + 2}`
      const name = findValue(row, ['name'])
      const address = findValue(row, ['adresse', 'address'])
      const categoryRaw = findValue(row, ['kategorie', 'category']).toLowerCase()

      if (!name || !address) {
        skipped.push(`${rowLabel}: Name oder Adresse fehlt`)
        continue
      }

      const normalizedAddress = normalizeAddress(address)
      if (
        existingAddresses.has(normalizedAddress) ||
        rowsToInsert.some((r) => normalizeAddress(r.address) === normalizedAddress)
      ) {
        skipped.push(`${rowLabel}: Adresse "${address}" gibt es schon (doppelt)`)
        continue
      }

      const matchedCategory =
        Object.entries(CATEGORY_LABELS).find(
          ([key, label]) => key === categoryRaw || label.toLowerCase() === categoryRaw
        )?.[0] ?? 'sonstiges'

      setExcelProgress(`${rowLabel} von ${rows.length}: Adresse wird gesucht...`)
      const coords = await geocodeAddress(address)
      await sleep(1100)

      if (!coords) {
        skipped.push(`${rowLabel}: Adresse "${address}" nicht gefunden`)
        continue
      }

      const matchedArea = areasWithBoundary.find((a) => isWithinArea(a, coords.lat, coords.lng))
      if (!matchedArea) {
        skipped.push(`${rowLabel}: "${address}" liegt in keinem eurer Gebiete`)
        continue
      }

      rowsToInsert.push({
        org_id: organization.id,
        title: name,
        address,
        area_id: matchedArea.id,
        category: matchedCategory,
        status: role === 'organizer' ? 'offen' : 'vorschlag',
        lat: coords.lat,
        lng: coords.lng,
      })
    }

    setExcelProgress('')

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from('tasks').insert(rowsToInsert)
      if (error) {
        setMessage('Fehler: ' + error.message)
        setExcelSubmitting(false)
        return
      }
    }

    setMessage(
      `${rowsToInsert.length} Aufgabe${rowsToInsert.length === 1 ? '' : 'n'} angelegt.` +
        (skipped.length > 0 ? ` ${skipped.length} übersprungen: ${skipped.join('; ')}` : '')
    )
    setExcelSubmitting(false)
    loadData()
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
          <p className="text-sm text-gray-600">Du musst eingeloggt sein.</p>
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
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Aufgabe anlegen</h1>
          <Link href="/tasks" className="text-sm font-medium text-teal-600 hover:text-teal-700">
            ← Zur Aufgabenliste
          </Link>
        </div>

        {areas.length === 0 ? (
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            Es gibt noch kein Gebiet für diese Organisation. Aufgaben können erst angelegt werden, wenn
            mindestens ein Gebiet existiert.{' '}
            {role === 'organizer' ? (
              <Link href="/areas" className="font-medium text-teal-600 hover:text-teal-700">
                Jetzt Gebiet anlegen
              </Link>
            ) : (
              'Frag deinen Organisator.'
            )}
          </div>
        ) : (
          <>
            <form onSubmit={handleAddTask} className="mt-5 space-y-2">
              <div className="flex gap-2">
                <select
                  value={newAreaId}
                  onChange={(e) => setNewAreaId(e.target.value)}
                  required
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="" disabled>
                    Gebiet wählen...
                  </option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Adresse, z.B. Musterstraße 1"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  required
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
                >
                  Anlegen
                </button>
              </div>
            </form>

            {role === 'organizer' && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                <p className="text-sm font-medium text-gray-700">Excel-Import</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Datei mit Spalten <span className="font-mono">Name</span> und{' '}
                  <span className="font-mono">Adresse</span> (optional{' '}
                  <span className="font-mono">Kategorie</span>). Das Gebiet wird automatisch anhand der
                  Adresse erkannt – dafür müssen eure Gebiete schon angelegt sein.
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelUpload}
                  disabled={excelSubmitting}
                  className="mt-2 block w-full text-sm text-gray-600"
                />
                {excelSubmitting && (
                  <p className="mt-1 text-xs text-gray-500">{excelProgress || 'Wird verarbeitet...'}</p>
                )}
              </div>
            )}

            {role === 'organizer' && (
              <div className="mt-3">
                <button
                  onClick={() => setBulkOpen((open) => !open)}
                  className="text-sm font-medium text-teal-600 hover:text-teal-700"
                >
                  {bulkOpen ? '– Mehrere Aufgaben auf einmal schließen' : '+ Mehrere Aufgaben auf einmal anlegen'}
                </button>

                {bulkOpen && (
                  <form
                    onSubmit={handleBulkCreate}
                    className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-white p-3"
                  >
                    <div className="flex gap-2">
                      <select
                        value={bulkAreaId}
                        onChange={(e) => setBulkAreaId(e.target.value)}
                        required
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        <option value="">Gebiet wählen...</option>
                        {areas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={bulkCategory}
                        onChange={(e) => setBulkCategory(e.target.value)}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      >
                        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {BRAND_SUGGESTIONS[bulkCategory] && (
                      <div className="flex flex-wrap gap-2">
                        {BRAND_SUGGESTIONS[bulkCategory].map((brand) => (
                          <button
                            key={brand}
                            type="button"
                            onClick={() =>
                              setBulkAddresses((current) => (current ? `${current}\n${brand}, ` : `${brand}, `))
                            }
                            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                          >
                            + {brand}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setBulkAddresses((current) => (current ? `${current}\n` : ''))}
                          className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          + Sonstiges (frei eintippen)
                        </button>
                      </div>
                    )}
                    <textarea
                      value={bulkAddresses}
                      onChange={(e) => setBulkAddresses(e.target.value)}
                      placeholder={'Eine Zeile pro Ort, z.B.\nREWE, Musterstraße 1\nMcFit, Musterstraße 3\nMusterstraße 5 (ohne Name)'}
                      rows={5}
                      required
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <p className="text-xs text-gray-500">
                      Format: <span className="font-mono">Name, Adresse</span> oder nur die Adresse. Bei
                      "Privathaushalt" werden bis zu {MAX_HOUSEHOLDS_PER_BUNDLE} Adressen automatisch zu
                      einer Aufgabe gebündelt, bei den anderen Kategorien entsteht eine Aufgabe pro Zeile.
                    </p>
                    <button
                      type="submit"
                      disabled={bulkSubmitting}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {bulkSubmitting ? 'Adressen werden gesucht...' : 'Aufgaben anlegen'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </>
        )}

        {message && (
          <p className={`mt-3 text-sm ${message.startsWith('Fehler') ? 'text-red-600' : 'text-emerald-600'}`}>
            {message}
          </p>
        )}
      </div>
    </main>
  )
}
