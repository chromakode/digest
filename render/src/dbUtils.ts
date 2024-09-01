import { AsyncDatabase } from 'promised-sqlite3'

export function openDB() {
  return AsyncDatabase.open(import.meta.env.DB_PATH ?? './digest.db')
}

export async function getLastUpdateTimestamp(db: AsyncDatabase) {
  const row = await db.get<{ timestamp: string }>(
    'SELECT timestamp FROM updateLog WHERE sourceId = "system" ORDER BY timestamp DESC LIMIT 1',
  )
  return row?.timestamp + 'Z'
}
