import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Outreach App',
    short_name: 'Outreach',
    description: 'Gemeinsam lokale Outreach-Aktionen organisieren',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#0d9488',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
