import { MiniSearch, log } from '../../deps.ts'
import { miniSearchConfig } from '@shared/searchConfig.ts'
import { Store } from './storage.ts'

export async function generateIndex(store: Store, destPath: string) {
  const startTime = performance.now()

  log.info('indexing content')
  const minisearch = new MiniSearch(miniSearchConfig)
  await minisearch.addAllAsync(
    store.getContentWithChildSummaries({ since: { weeks: 1 } }),
  )

  const durationMs = performance.now() - startTime
  log.info('finished indexing content in', durationMs, 'ms')

  Deno.writeTextFile(destPath, JSON.stringify(minisearch))
}
