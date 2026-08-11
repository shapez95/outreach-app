'use client'

import { useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, useMap } from 'react-leaflet'
import type { GeoJSON as GeoJSONType } from 'geojson'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type Task = {
  id: string
  title: string
  status: string
  address: string | null
  lat: number | null
  lng: number | null
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

function markerIcon(status: string) {
  const color = STATUS_COLORS[status] ?? '#6b7280'
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
          background: 'white',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        }}
      >
        📍 Mein Standort
      </button>
      {error && (
        <p style={{ marginTop: 4, fontSize: 11, color: '#dc2626', background: 'white', padding: '2px 6px', borderRadius: 4 }}>
          {error}
        </p>
      )}
    </div>
  )
}

export default function MapView({ tasks, areas = [] }: { tasks: Task[]; areas?: Area[] }) {
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null)
  const located = tasks.filter((t) => t.lat != null && t.lng != null)
  const center: [number, number] =
    located.length > 0 ? [located[0].lat as number, located[0].lng as number] : [53.5511, 9.9937]

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <LocateControl onLocate={setMyLocation} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
          >
            <Popup>{area.name}</Popup>
          </GeoJSON>
        ))}
      {located.map((task) => (
        <Marker key={task.id} position={[task.lat as number, task.lng as number]} icon={markerIcon(task.status)}>
          <Popup>
            <p className="font-medium">{task.title}</p>
            <p>{STATUS_LABELS[task.status] ?? task.status}</p>
            {task.address && <p>{task.address}</p>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
