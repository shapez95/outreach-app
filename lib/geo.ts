import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import type { Geometry } from 'geojson'

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
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

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`
    )
    const data = await res.json()
    const addr = data?.address
    if (addr?.road) {
      return [addr.road, addr.house_number].filter(Boolean).join(' ')
    }
    return data?.display_name ?? null
  } catch {
    return null
  }
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isWithinArea(
  area: { boundary: Geometry | { type: string } | null },
  lat: number,
  lng: number
): boolean {
  if (!area.boundary) return true
  const geometry = area.boundary as Geometry
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return true
  return booleanPointInPolygon(point([lng, lat]), geometry)
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function orderByNearestNeighbor<T extends { lat: number; lng: number }>(
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

export const CATEGORY_LABELS: Record<string, string> = {
  privathaushalt: 'Privathaushalt',
  restaurant: 'Restaurant',
  supermarkt: 'Supermarkt',
  fitnessstudio: 'Fitnessstudio',
  sonstiges: 'Sonstiges',
}

export const BRAND_SUGGESTIONS: Record<string, string[]> = {
  supermarkt: ['REWE', 'Edeka', 'Aldi'],
  fitnessstudio: ['McFit', 'FitX', 'Clever Fit'],
}

export const MAX_HOUSEHOLDS_PER_BUNDLE = 10
