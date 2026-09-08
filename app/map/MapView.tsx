'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import type { GeoJSON as GeoJSONType, Geometry } from 'geojson'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import { MapPin, Flame } from '@phosphor-icons/react'

type Task = {
  id: string
  title: string
  status: string
  address: string | null
  lat: number | null
  lng: number | null
  building_boundary?: Geometry | null
}

type Area = {
  id: string
  name: string
  boundary: object | null
}

const STATUS_LABELS: Record<string, string> = {
  vorschlag: 'Vorschlag',
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  zur_pruefung: 'Zur Prüfung',
  erledigt: 'Bestätigt',
}

const STATUS_COLORS: Record<string, string> = {
  vorschlag: '#9333ea',
  offen: '#6b7280',
  in_bearbeitung: '#d97706',
  zur_pruefung: '#2563eb',
  erledigt: '#059669',
}

const AREA_COLORS = ['#0d9488', '#c2410c', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f']

const ERLEDIGT_HATCH_PATTERN_ID = 'erledigt-hatch-pattern'

// Referenced by id from GeoJSON fillColor below - SVG ids are looked up document-wide, so this
// doesn't need to live inside the map's own <svg>.
function HatchDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }}>
      <defs>
        <pattern
          id={ERLEDIGT_HATCH_PATTERN_ID}
          patternUnits="userSpaceOnUse"
          width={6}
          height={6}
          patternTransform="rotate(45)"
        >
          <rect width={6} height={6} fill="white" fillOpacity={0.3} />
          <line x1={0} y1={0} x2={0} y2={6} stroke={STATUS_COLORS.erledigt} strokeWidth={3} />
        </pattern>
      </defs>
    </svg>
  )
}

function markerIcon(status: string) {
  const color = STATUS_COLORS[status] ?? '#6b7280'

  // Erledigte Aufgaben werden schraffiert statt als solide Nadel dargestellt, damit auf
  // einen Blick klar ist, wo schon gearbeitet wurde - Nadeln bleiben offenen/laufenden
  // Aufgaben vorbehalten, auf die noch reagiert werden muss.
  if (status === 'erledigt') {
    return L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;border-radius:50%;background:repeating-linear-gradient(45deg,${color},${color} 2px,white 2px,white 4px);border:2px solid ${color};box-shadow:0 0 2px rgba(0,0,0,0.5);"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
  }

  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

const myLocationIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const pendingPointIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#dc2626;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);transform:rotate(-45deg);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

function ClickHandler({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function AutoLocate({ onLocate }: { onLocate: (pos: [number, number]) => void }) {
  const map = useMap()

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
        onLocate(coords)
        map.flyTo(coords, 18)
      },
      () => {}
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

function LocateControl({ onLocate }: { onLocate: (pos: [number, number]) => void }) {
  const map = useMap()
  const [error, setError] = useState('')

  function handleClick() {
    setError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
        onLocate(coords)
        map.flyTo(coords, 15)
      },
      () => setError('Standort nicht verfügbar')
    )
  }

  return (
    <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
      <button
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'white',
          border: '1px solid #d7e6e3',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <MapPin size={14} aria-hidden="true" />
        Mein Standort
      </button>
      {error && (
        <p style={{ marginTop: 4, fontSize: 11, color: '#dc2626', background: 'white', padding: '2px 6px', borderRadius: 4 }}>
          {error}
        </p>
      )}
    </div>
  )
}

function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return
    const layer = L.heatLayer(points, { radius: 28, blur: 20, maxZoom: 18 }).addTo(map)
    return () => {
      map.removeLayer(layer)
    }
  }, [map, points])

  return null
}

function HeatmapToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000 }}>
      <button
        onClick={onToggle}
        aria-pressed={enabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: enabled ? '#059669' : 'white',
          color: enabled ? 'white' : 'black',
          border: '1px solid #d7e6e3',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <Flame size={14} weight={enabled ? 'fill' : 'regular'} aria-hidden="true" />
        Heatmap
      </button>
    </div>
  )
}

export default function MapView({
  tasks,
  areas = [],
  onMapClick,
  pendingPoint,
  autoLocate,
  initialZoom,
}: {
  tasks: Task[]
  areas?: Area[]
  onMapClick?: (lat: number, lng: number) => void
  pendingPoint?: [number, number] | null
  autoLocate?: boolean
  initialZoom?: number
}) {
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const located = tasks.filter((t) => t.lat != null && t.lng != null)
  const withBuildingHatch = located.filter((t) => t.status === 'erledigt' && t.building_boundary)
  const withMarker = located.filter((t) => !(t.status === 'erledigt' && t.building_boundary))
  const erledigtPoints: [number, number, number][] = located
    .filter((t) => t.status === 'erledigt')
    .map((t) => [t.lat as number, t.lng as number, 1])
  const center: [number, number] = pendingPoint
    ? pendingPoint
    : located.length > 0
      ? [located[0].lat as number, located[0].lng as number]
      : [53.5511, 9.9937]

  return (
    <>
    <HatchDefs />
    <MapContainer center={center} zoom={initialZoom ?? 13} style={{ height: '100%', width: '100%' }}>
      {autoLocate && <AutoLocate onLocate={setMyLocation} />}
      <LocateControl onLocate={setMyLocation} />
      {erledigtPoints.length > 0 && (
        <HeatmapToggle enabled={showHeatmap} onToggle={() => setShowHeatmap((v) => !v)} />
      )}
      {showHeatmap && <HeatLayer points={erledigtPoints} />}
      <ClickHandler onMapClick={onMapClick} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pendingPoint && (
        <Marker position={pendingPoint} icon={pendingPointIcon}>
          <Popup>Ausgewählter Punkt</Popup>
        </Marker>
      )}
      {myLocation && (
        <Marker position={myLocation} icon={myLocationIcon}>
          <Popup>Dein Standort</Popup>
        </Marker>
      )}
      {areas
        .filter((area) => area.boundary)
        .map((area, i) => (
          <GeoJSON
            key={area.id}
            data={area.boundary as GeoJSONType}
            pathOptions={{
              color: AREA_COLORS[i % AREA_COLORS.length],
              weight: 2,
              fillOpacity: 0.08,
            }}
            eventHandlers={{
              click: (e) => {
                onMapClick?.(e.latlng.lat, e.latlng.lng)
              },
            }}
          >
            <Popup>{area.name}</Popup>
          </GeoJSON>
        ))}
      {withBuildingHatch.map((task) => (
        <GeoJSON
          key={task.id}
          data={task.building_boundary as GeoJSONType}
          pathOptions={{
            color: STATUS_COLORS.erledigt,
            weight: 2,
            fillColor: `url(#${ERLEDIGT_HATCH_PATTERN_ID})`,
            fillOpacity: 1,
          }}
        >
          <Popup>
            <p className="font-medium">{task.title}</p>
            <p>{STATUS_LABELS[task.status] ?? task.status}</p>
            {task.address && <p>{task.address}</p>}
          </Popup>
        </GeoJSON>
      ))}
      {withMarker.map((task) => (
        <Marker key={task.id} position={[task.lat as number, task.lng as number]} icon={markerIcon(task.status)}>
          <Popup>
            <p className="font-medium">{task.title}</p>
            <p>{STATUS_LABELS[task.status] ?? task.status}</p>
            {task.address && <p>{task.address}</p>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
    </>
  )
}
