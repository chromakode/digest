import { MiniSearch } from '../../deps.ts'
import { miniSearchConfig } from '@shared/searchConfig.ts'
import { Store } from './storage.ts'

export async function generateIndex(store: Store, destPath: string) {
  const minisearch = new MiniSearch(miniSearchConfig)
  await minisearch.addAllAsync(store.getContentWithChildSummaries())

  Deno.writeTextFile(destPath, JSON.stringify(minisearch))
}
