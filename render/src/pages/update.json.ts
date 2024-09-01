import type { APIRoute } from 'astro'
import { getLastUpdateTimestamp, openDB } from 'src/dbUtils'

export const GET: APIRoute = async () => {
  const db = await openDB()
  const lastUpdate = await getLastUpdateTimestamp(db)
  return new Response(JSON.stringify({ lastUpdate }))
}
