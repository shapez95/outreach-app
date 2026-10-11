// Pinged daily by the Vercel Cron Job in vercel.json so the Supabase free-tier
// project sees API traffic and never hits its ~7-day inactivity auto-pause.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    return Response.json({ ok: false, error: 'Missing Supabase env vars' }, { status: 500 })
  }

  const res = await fetch(`${url}/rest/v1/organizations?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return Response.json({ ok: res.ok, status: res.status })
}
