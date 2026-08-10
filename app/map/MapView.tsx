'use client'

import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from 'react-leaflet'
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

export default function MapView({ tasks, areas = [] }: { tasks: Task[]; areas?: Area[] }) {
  const located = tasks.filter((t) => t.lat != null && t.lng != null)
  const center: [number, number] =
    located.length > 0 ? [located[0].lat as number, located[0].lng as number] : [53.5511, 9.9937]

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
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
