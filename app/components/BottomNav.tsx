'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Session } from '@supabase/supabase-js'
import { House, FlagBanner, UserCircle } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'

type Membership = {
  role: string
  organizations: { id: string; name: string } | null
}

export default function BottomNav() {
  const pathname = usePathname()
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setMemberships([])
      return
    }
    supabase
      .from('memberships')
      .select('role, organizations(id, name)')
      .eq('profile_id', session.user.id)
      .then(({ data }) => setMemberships((data as unknown as Membership[]) ?? []))
  }, [session])

  async function handleShowCode(orgId: string) {
    const { data, error } = await supabase.rpc('get_invite_code', { target_org_id: orgId })
    if (!error && data) {
      setInviteCodes((current) => ({ ...current, [orgId]: data }))
    }
  }

  function handlePickOrg(orgId: string) {
    localStorage.setItem('currentOrgId', orgId)
    localStorage.removeItem('currentAreaId')
    setPickerOpen(false)
    window.location.href = '/areas'
  }

  if (!session) return null

  return (
    <>
      {pickerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/30"
          onClick={() => setPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-card p-4 pb-8"
          >
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Organisation wählen
            </p>
            <div className="space-y-2">
              {memberships.map((m) => (
                <div
                  key={m.organizations?.id}
                  className="rounded-xl border border-border px-4 py-3 text-sm"
                >
                  <button
                    onClick={() => m.organizations && handlePickOrg(m.organizations.id)}
                    className="flex w-full items-center justify-between text-left hover:text-primary-hover"
                  >
                    <span className="font-medium text-foreground">{m.organizations?.name}</span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {m.role === 'organizer' ? 'Organisator' : 'Helfer'}
                    </span>
                  </button>
                  {m.role === 'organizer' && m.organizations && (
                    <div className="mt-2">
                      {inviteCodes[m.organizations.id] ? (
                        <p className="font-mono text-sm font-semibold tracking-wider text-foreground">
                          Code: {inviteCodes[m.organizations.id]}
                        </p>
                      ) : (
                        <button
                          onClick={() => handleShowCode(m.organizations!.id)}
                          className="text-xs font-medium text-primary hover:text-primary-hover"
                        >
                          Einladungscode anzeigen
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {memberships.length === 0 && (
                <p className="text-sm text-muted-foreground">Noch keiner Organisation beigetreten.</p>
              )}
              <Link
                href="/join"
                onClick={() => setPickerOpen(false)}
                className="block rounded-xl border border-dashed border-border px-4 py-3 text-center text-sm font-medium text-primary hover:bg-muted"
              >
                Beitreten / Gründen
              </Link>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card">
        {(() => {
          const active = pathname === '/'
          return (
            <Link
              href="/"
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${active ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
            >
              <House size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              Start
            </Link>
          )
        })()}
        <button
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium text-muted-foreground hover:text-primary"
        >
          <FlagBanner size={22} aria-hidden="true" />
          Organisationen
        </button>
        {(() => {
          const active = pathname === '/account'
          return (
            <Link
              href="/account"
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${active ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
            >
              <UserCircle size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              Konto
            </Link>
          )
        })()}
      </nav>
    </>
  )
}
