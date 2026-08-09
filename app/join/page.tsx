'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export default function Join() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })
  }, [])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('join_organization_with_code', {
      invite_code_input: code,
    })

    if (error) {
      setMessage('Fehler: ' + error.message)
    } else {
      router.push('/')
      router.refresh()
    }
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
          <p className="text-sm text-gray-600">Du musst eingeloggt sein, um einer Organisation beizutreten.</p>
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

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Organisation beitreten</h1>
        <p className="mt-1 text-sm text-gray-600">
          Gib den Einladungscode ein, den du von deinem Organisator bekommen hast.
        </p>

        <form onSubmit={handleJoin} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Einladungscode</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Beitreten
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
      </div>
    </main>
  )
}
