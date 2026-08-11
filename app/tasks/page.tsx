'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import type { Feature, Geometry } from 'geojson'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

type Task = {
  id: string
  org_id: string
  title: string
  status: string
  assigned_to: string | null
  proof_path: string | null
  comment: string | null
  conversation_count: number
  flyer_count: number
  contact_name: string | null
  area_id: string | null
  points: number
  address: string | null
  address_list: string | null
  category: string | null
  lat: number | null
  lng: number | null
  created_at: string
}

const POINTS_PER_TASK = 10
const POINTS_PER_CONVERSATION = 5
const MAX_HOUSEHOLDS_PER_BUNDLE = 10

const CATEGORY_LABELS: Record<string, string> = {
  privathaushalt: 'Privathaushalt',
  restaurant: 'Restaurant',
  supermarkt: 'Supermarkt',
  fitnessstudio: 'Fitnessstudio',
  sonstiges: 'Sonstiges',
}

const BRAND_SUGGESTIONS: Record<string, string[]> = {
  supermarkt: ['REWE', 'Edeka', 'Aldi'],
  fitnessstudio: ['McFit', 'FitX', 'Clever Fit'],
}

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
  boundary: Feature<Geometry> | Geometry | null
}

type OrgMember = {
  profile_id: string
  email: string
  role: string
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

function orderByNearestNeighbor<T extends { lat: number; lng: number }>(
  start: { lat: number; lng: number },
  points: T[]
): T[] {
  const remaining = [...points]
  const ordered: T[] = []
  let current = start
  while (remaining.length > 0) {
    let nearestIndex = 0
    let nearestDist = Infinity
    remaining.forEach((p, i) => {
      const d = distanceKm(current, p)
      if (d < nearestDist) {
        nearestDist = d
        nearestIndex = i
      }
    })
    const [next] = remaining.splice(nearestIndex, 1)
    ordered.push(next)
    current = next
  }
  return ordered
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isWithinArea(area: Area, lat: number, lng: number): boolean {
  if (!area.boundary) return true
  const geometry = area.boundary as Geometry
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return true
  return booleanPointInPolygon(point([lng, lat]), geometry)
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
  const [areas, setAreas] = useState<Area[]>([])
  const [newAreaId, setNewAreaId] = useState('')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [assigneeEmails, setAssigneeEmails] = useState<Record<string, string>>({})
  const [newAddress, setNewAddress] = useState('')
  const [bulkAreaId, setBulkAreaId] = useState('')
  const [bulkCategory, setBulkCategory] = useState('privathaushalt')
  const [bulkAddresses, setBulkAddresses] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [excelSubmitting, setExcelSubmitting] = useState(false)
  const [excelProgress, setExcelProgress] = useState('')
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])
  const [flyersReceived, setFlyersReceived] = useState(0)
  const [flyersPlaced, setFlyersPlaced] = useState(0)
  const [issueMemberId, setIssueMemberId] = useState('')
  const [issueAmount, setIssueAmount] = useState('')
  const [message, setMessage] = useState('')
  const [orgChecked, setOrgChecked] = useState(false)
  const [filterAreaId, setFilterAreaId] = useState<string | null>(null)
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null)
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'distance'>('newest')
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [routeMode, setRouteMode] = useState(false)
  const [selectedForRoute, setSelectedForRoute] = useState<Set<string>>(new Set())
  const [routeError, setRouteError] = useState('')
  const [routeStart, setRouteStart] = useState('current')
  const [routeEnd, setRouteEnd] = useState('auto')
  const [routeTravelMode, setRouteTravelMode] = useState<'driving' | 'walking' | 'bicycling' | 'transit'>(
    'driving'
  )
  const [routeLegs, setRouteLegs] = useState<{ label: string; url: string }[]>([])

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

      const assigneeIds = [...new Set(loadedTasks.map((t) => t.assigned_to).filter(Boolean))] as string[]
      if (assigneeIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', assigneeIds)
        setAssigneeEmails(
          Object.fromEntries((profiles ?? []).map((p) => [p.id, p.email as string]))
        )
      }

      const { data: issuances } = await supabase
        .from('flyer_issuances')
        .select('amount')
        .eq('org_id', org.id)
        .eq('profile_id', session.session.user.id)
      setFlyersReceived((issuances ?? []).reduce((sum, i) => sum + i.amount, 0))
      setFlyersPlaced(
        loadedTasks
          .filter((t) => t.assigned_to === session.session!.user.id)
          .reduce((sum, t) => sum + t.flyer_count, 0)
      )

      if (membership?.role === 'organizer') {
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
  }

  useEffect(() => {
    loadTasks()
    const savedAreaId = typeof window !== 'undefined' ? localStorage.getItem('currentAreaId') : null
    if (savedAreaId) {
      setFilterAreaId(savedAreaId)
      setNewAreaId(savedAreaId)
    }
  }, [])

  function handleClearAreaFilter() {
    localStorage.removeItem('currentAreaId')
    setFilterAreaId(null)
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
      setMessage('Fehler: ' + error.message)
    } else {
      setIssueMemberId('')
      setIssueAmount('')
      loadTasks()
    }
  }

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

    const { error } = await supabase
      .from('tasks')
      .insert({
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
      setNewAreaId('')
      setNewAddress('')
      loadTasks()
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
      setBulkAddresses('')
      setBulkOpen(false)
      loadTasks()
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
    loadTasks()
  }

  async function updateTask(
    taskId: string,
    changes: Partial<
      Pick<
        Task,
        | 'status'
        | 'assigned_to'
        | 'proof_path'
        | 'comment'
        | 'conversation_count'
        | 'flyer_count'
        | 'contact_name'
        | 'points'
        | 'area_id'
        | 'title'
        | 'address'
        | 'lat'
        | 'lng'
      >
    >
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

  async function handleDeleteTask(taskId: string) {
    if (!window.confirm('Diese Aufgabe wirklich endgültig löschen?')) return

    const { error } = await supabase.from('tasks').delete().eq('id', taskId)

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      loadTasks()
    }
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>, taskId: string) {
    e.preventDefault()
    const form = e.currentTarget
    const title = (form.elements.namedItem('edit_title') as HTMLInputElement).value
    const address = (form.elements.namedItem('edit_address') as HTMLInputElement).value
    const areaId = (form.elements.namedItem('edit_area') as HTMLSelectElement).value
    const originalTask = tasks.find((t) => t.id === taskId)
    const addressChanged = address !== (originalTask?.address ?? '')

    const coords = addressChanged && address ? await geocodeAddress(address) : null
    const selectedArea = areas.find((a) => a.id === areaId)

    if (addressChanged && address && selectedArea?.boundary) {
      if (!coords) {
        setMessage(`Fehler: Adresse "${address}" konnte nicht gefunden werden. Bitte prüfen.`)
        return
      }
      if (!isWithinArea(selectedArea, coords.lat, coords.lng)) {
        setMessage(`Fehler: Die Adresse liegt außerhalb des Gebiets "${selectedArea.name}".`)
        return
      }
    }

    await updateTask(taskId, {
      title,
      address: address || null,
      area_id: areaId || null,
      ...(addressChanged ? { lat: coords?.lat ?? null, lng: coords?.lng ?? null } : {}),
    })
    setEditingTaskId(null)
  }

  function handleClaim(taskId: string) {
    if (!session) return
    updateTask(taskId, { status: 'in_bearbeitung', assigned_to: session.user.id })
  }

  async function handleSubmitForReview(e: React.FormEvent<HTMLFormElement>, task: Task) {
    e.preventDefault()
    if (!organization) return

    const form = e.currentTarget
    const fileInput = form.elements.namedItem('photo') as HTMLInputElement
    const commentInput = form.elements.namedItem('comment') as HTMLTextAreaElement
    const conversationInput = form.elements.namedItem('conversation_count') as HTMLInputElement
    const flyerInput = form.elements.namedItem('flyer_count') as HTMLInputElement
    const contactInput = form.elements.namedItem('contact_name') as HTMLInputElement
    const file = fileInput.files?.[0]
    if (!file) return

    const flyerCount = Number(flyerInput.value) || 0
    const flyersRemaining = flyersReceived - flyersPlaced
    if (flyerCount > flyersRemaining) {
      setMessage(`Fehler: Du hast nur noch ${flyersRemaining} Flyer übrig.`)
      return
    }

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

    await updateTask(task.id, {
      status: 'zur_pruefung',
      proof_path: path,
      comment: commentInput.value || null,
      conversation_count: Number(conversationInput.value) || 0,
      flyer_count: flyerCount,
      contact_name: contactInput.value || null,
    })
    setUploadingTaskId(null)
  }

  function handleConfirm(task: Task) {
    const points = POINTS_PER_TASK + task.conversation_count * POINTS_PER_CONVERSATION
    updateTask(task.id, { status: 'erledigt', points })
  }

  function handleReject(taskId: string) {
    updateTask(taskId, { status: 'in_bearbeitung' })
  }

  function toggleStatusFilter(status: string) {
    setStatusFilters((current) =>
      current.includes(status) ? current.filter((s) => s !== status) : [...current, status]
    )
  }

  function handleSortByDistance() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('Standort wird von diesem Browser nicht unterstützt.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setSortMode('distance')
      },
      () => setLocationError('Standort konnte nicht ermittelt werden. Bitte Standortfreigabe erlauben.')
    )
  }

  function toggleTaskForRoute(taskId: string) {
    setSelectedForRoute((current) => {
      const next = new Set(current)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
    if (userLocation) return Promise.resolve(userLocation)
    if (!navigator.geolocation) return Promise.resolve(null)
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude }
          setUserLocation(loc)
          resolve(loc)
        },
        () => resolve(null)
      )
    })
  }

  async function handleOpenRoute() {
    setRouteError('')
    setRouteLegs([])
    const selectedTasks = tasks.filter(
      (t) => selectedForRoute.has(t.id) && t.lat != null && t.lng != null
    ) as (Task & { lat: number; lng: number })[]

    if (selectedTasks.length === 0) {
      setRouteError('Bitte mindestens eine Aufgabe mit Adresse auswählen.')
      return
    }

    const startTask = routeStart !== 'current' ? selectedTasks.find((t) => t.id === routeStart) : null
    const endTask =
      routeEnd !== 'current' && routeEnd !== 'auto' ? selectedTasks.find((t) => t.id === routeEnd) : null

    let startPoint: { lat: number; lng: number; label: string } | null = startTask
      ? { lat: startTask.lat, lng: startTask.lng, label: startTask.title }
      : null
    if (!startPoint) {
      const loc = await getCurrentLocation()
      if (!loc) {
        setRouteError('Standort konnte nicht ermittelt werden. Bitte Standortfreigabe erlauben oder eine Aufgabe als Start wählen.')
        return
      }
      startPoint = { ...loc, label: 'Mein Standort' }
    }

    let endPoint: { lat: number; lng: number; label: string } | null = endTask
      ? { lat: endTask.lat, lng: endTask.lng, label: endTask.title }
      : null
    if (!endPoint && routeEnd === 'current') {
      const loc = await getCurrentLocation()
      if (!loc) {
        setRouteError('Standort für das Ziel konnte nicht ermittelt werden.')
        return
      }
      endPoint = { ...loc, label: 'Mein Standort' }
    }

    const middlePoints = selectedTasks
      .filter((t) => t.id !== startTask?.id && t.id !== endTask?.id)
      .map((t) => ({ lat: t.lat, lng: t.lng, label: t.title }))
    const ordered = orderByNearestNeighbor(startPoint, middlePoints)

    let stops: { lat: number; lng: number; label: string }[]
    if (endPoint) {
      stops = [startPoint, ...ordered, endPoint]
    } else {
      if (ordered.length === 0) {
        setRouteError('Bitte mindestens ein weiteres Ziel auswählen oder ein Ziel festlegen.')
        return
      }
      stops = [startPoint, ...ordered]
    }

    const legs = []
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]
      const to = stops[i + 1]
      const url =
        `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}` +
        `&travelmode=${routeTravelMode}`
      legs.push({ label: `${i + 1}. ${from.label} → ${to.label}`, url })
    }
    setRouteLegs(legs)
  }

  function sortTasks(list: Task[]) {
    if (sortMode === 'oldest') {
      return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
    }
    if (sortMode === 'distance' && userLocation) {
      return [...list].sort((a, b) => {
        const distA = a.lat != null && a.lng != null ? distanceKm(userLocation, { lat: a.lat, lng: a.lng }) : Infinity
        const distB = b.lat != null && b.lng != null ? distanceKm(userLocation, { lat: b.lat, lng: b.lng }) : Infinity
        return distA - distB
      })
    }
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
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
            Aufgaben
            {filterAreaId ? ` – ${areas.find((a) => a.id === filterAreaId)?.name ?? ''}` : ''}
          </h1>
          <div className="flex items-center gap-3">
            <Link href="/areas" className="text-sm font-medium text-teal-600 hover:text-teal-700">
              Gebiete & Karte
            </Link>
            <Link href="/" className="text-sm font-medium text-teal-600 hover:text-teal-700">
              ← Zurück
            </Link>
          </div>
        </div>

        {filterAreaId && (
          <button
            onClick={handleClearAreaFilter}
            className="mt-1 text-xs font-medium text-teal-600 hover:text-teal-700"
          >
            Alle Aufgaben zeigen (Gebietsfilter aufheben)
          </button>
        )}

        <div className="mt-4 rounded-xl bg-teal-50 p-3 text-xs text-teal-800">
          Deine Flyer: {flyersReceived} erhalten · {flyersPlaced} platziert ·{' '}
          <span className="font-semibold">{flyersReceived - flyersPlaced} übrig</span>
        </div>

        {role === 'organizer' && (
          <form onSubmit={handleIssueFlyers} className="mt-2 flex gap-2">
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
        )}

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
              <span className="font-mono">Adresse</span> (optional <span className="font-mono">Kategorie</span>).
              Das Gebiet wird automatisch anhand der Adresse erkannt – dafür müssen eure Gebiete schon
              angelegt sein.
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
                  "Privathaushalt" werden bis zu {MAX_HOUSEHOLDS_PER_BUNDLE} Adressen automatisch zu einer
                  Aufgabe gebündelt, bei den anderen Kategorien entsteht eine Aufgabe pro Zeile.
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

        {message && <p className="mt-3 text-sm text-red-600">{message}</p>}

        <details className="mt-5 w-fit">
          <summary className="cursor-pointer list-none rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Status filtern {statusFilters.length > 0 ? `(${statusFilters.length})` : '(Alle)'}
          </summary>
          <div className="mt-2 space-y-1 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            {['vorschlag', 'offen', 'in_bearbeitung', 'zur_pruefung', 'erledigt'].map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={statusFilters.includes(status)}
                  onChange={() => toggleStatusFilter(status)}
                  className="rounded border-gray-300"
                />
                {STATUS_LABELS[status]}
              </label>
            ))}
            {statusFilters.length > 0 && (
              <button
                onClick={() => setStatusFilters([])}
                className="mt-1 text-xs font-medium text-teal-600 hover:text-teal-700"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        </details>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Sortieren:</span>
          <button
            onClick={() => setSortMode('newest')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${sortMode === 'newest' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Neueste
          </button>
          <button
            onClick={() => setSortMode('oldest')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${sortMode === 'oldest' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Älteste
          </button>
          <button
            onClick={handleSortByDistance}
            className={`rounded-full px-3 py-1 text-xs font-medium ${sortMode === 'distance' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            Entfernung
          </button>
        </div>
        {locationError && <p className="mt-1 text-xs text-red-600">{locationError}</p>}
        {sortMode === 'distance' && (
          <p className="mt-1 text-xs text-gray-500">
            Aufgaben ohne Adresse/Koordinaten werden ans Ende sortiert.
          </p>
        )}

        <div className="mt-3">
          <button
            onClick={() => {
              setRouteMode((v) => !v)
              setSelectedForRoute(new Set())
              setRouteError('')
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${routeMode ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {routeMode ? '✕ Routenplanung beenden' : '🧭 Route für mehrere Aufgaben planen'}
          </button>

          {routeMode && (
            <div className="mt-2 space-y-2 rounded-xl border border-gray-200 bg-white p-3">
              <span className="text-xs text-gray-500">
                Wähl unten Aufgaben mit Häkchen aus ({selectedForRoute.size} ausgewählt).
              </span>

              <div className="flex flex-wrap gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600">Start</label>
                  <select
                    value={routeStart}
                    onChange={(e) => setRouteStart(e.target.value)}
                    className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="current">Mein aktueller Standort</option>
                    {tasks
                      .filter((t) => selectedForRoute.has(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600">Ziel</label>
                  <select
                    value={routeEnd}
                    onChange={(e) => setRouteEnd(e.target.value)}
                    className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="auto">Automatisch (letzter Stopp)</option>
                    <option value="current">Mein aktueller Standort</option>
                    {tasks
                      .filter((t) => selectedForRoute.has(t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600">Verkehrsmittel</label>
                  <select
                    value={routeTravelMode}
                    onChange={(e) => setRouteTravelMode(e.target.value as typeof routeTravelMode)}
                    className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="driving">Auto</option>
                    <option value="walking">Zu Fuß</option>
                    <option value="bicycling">Fahrrad</option>
                    <option value="transit">Öffentliche Verkehrsmittel</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleOpenRoute}
                disabled={selectedForRoute.size === 0}
                className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Route berechnen
              </button>

              {routeLegs.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">
                    Tipp dich während der Tour Etappe für Etappe durch:
                  </p>
                  {routeLegs.map((leg, i) => (
                    <a
                      key={i}
                      href={leg.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg border border-gray-200 px-3 py-2 text-sm text-teal-700 hover:bg-gray-50"
                    >
                      {leg.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {routeError && <p className="mt-1 text-xs text-red-600">{routeError}</p>}
        </div>

        <ul className="mt-4 space-y-3">
          {sortTasks(
            tasks.filter(
              (task) =>
                (statusFilters.length === 0 || statusFilters.includes(task.status)) &&
                (!filterAreaId || task.area_id === filterAreaId)
            )
          )
            .map((task) => (
            <li
              key={task.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              {editingTaskId === task.id ? (
                <form onSubmit={(e) => handleSaveEdit(e, task.id)} className="space-y-2">
                  <input
                    name="edit_title"
                    defaultValue={task.title}
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <input
                    name="edit_address"
                    defaultValue={task.address ?? ''}
                    placeholder="Adresse (optional)"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <select
                    name="edit_area"
                    defaultValue={task.area_id ?? ''}
                    required
                    className="block w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
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
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTaskId(null)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Abbrechen
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {routeMode && task.lat != null && task.lng != null && (
                      <input
                        type="checkbox"
                        checked={selectedForRoute.has(task.id)}
                        onChange={() => toggleTaskForRoute(task.id)}
                        className="mt-1 rounded border-gray-300"
                      />
                    )}
                    <div>
                    <p className="font-medium text-gray-900">{task.title}</p>
                    <p className="text-xs text-gray-500">
                      {[
                        task.area_id
                          ? areas.find((a) => a.id === task.area_id)?.name ?? 'Unbekanntes Gebiet'
                          : null,
                        task.category ? CATEGORY_LABELS[task.category] ?? task.category : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {task.address_list && (
                      <p className="mt-0.5 text-xs text-gray-500">{task.address_list}</p>
                    )}
                    {task.address && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-xs font-medium text-teal-600 hover:text-teal-700"
                      >
                        📍 {task.address} – Route öffnen
                      </a>
                    )}
                    {role === 'organizer' && (
                      <div className="mt-0.5 flex gap-3">
                        <button
                          onClick={() => setEditingTaskId(task.id)}
                          className="text-xs font-medium text-gray-500 hover:text-teal-600"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-xs font-medium text-gray-500 hover:text-red-600"
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
              )}

              {role === 'organizer' && task.assigned_to && assigneeEmails[task.assigned_to] && (
                <p className="mt-1 text-xs text-gray-500">
                  Bearbeitet von: {assigneeEmails[task.assigned_to]}
                </p>
              )}

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
                  className="mt-3 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
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
                  <textarea
                    name="comment"
                    placeholder="Kommentar (optional), z.B. was ist passiert?"
                    rows={2}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    name="contact_name"
                    placeholder="Name der Gesprächspartnerin/des Gesprächspartners (optional)"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <div className="flex gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Geführte Gespräche
                      </label>
                      <input
                        type="number"
                        name="conversation_count"
                        min={0}
                        defaultValue={0}
                        className="mt-1 w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Platzierte Flyer
                      </label>
                      <input
                        type="number"
                        name="flyer_count"
                        min={0}
                        max={flyersReceived - flyersPlaced}
                        defaultValue={0}
                        className="mt-1 w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </div>
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

              {(task.status === 'zur_pruefung' || task.status === 'erledigt') && (
                <div className="mt-3 space-y-2">
                  {photoUrls[task.id] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls[task.id]}
                      alt="Nachweis-Foto"
                      className="max-h-64 w-full rounded-lg object-cover"
                    />
                  )}
                  <p className="text-sm text-gray-600">
                    Geführte Gespräche: <span className="font-medium">{task.conversation_count}</span> · Platzierte
                    Flyer: <span className="font-medium">{task.flyer_count}</span>
                  </p>
                  {task.contact_name && (
                    <p className="text-sm text-gray-600">
                      Gesprächspartner: <span className="font-medium">{task.contact_name}</span>
                    </p>
                  )}
                  {task.status === 'erledigt' && (
                    <p className="text-sm font-medium text-emerald-700">+{task.points} Punkte</p>
                  )}
                  {task.comment && (
                    <p className="rounded-lg bg-gray-50 p-2 text-sm text-gray-700">{task.comment}</p>
                  )}
                </div>
              )}

              {task.status === 'zur_pruefung' && role === 'organizer' && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleConfirm(task)}
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
          {tasks.filter(
            (task) =>
              (statusFilters.length === 0 || statusFilters.includes(task.status)) &&
              (!filterAreaId || task.area_id === filterAreaId)
          ).length === 0 && (
            <li className="text-sm text-gray-500">Keine Aufgaben mit diesem Status/Gebiet.</li>
          )}
        </ul>
      </div>
    </main>
  )
}
