// Download the DB and generate the search index for the site render.

import { log } from '../deps.ts'
import 'https://deno.land/std@0.224.0/dotenv/load.ts'
import { initMinio } from './lib/minio.ts'
import { generateIndex } from './lib/search.ts'
import { Store } from './lib/storage.ts'

log.setup({
  handlers: {
    default: new log.ConsoleHandler('DEBUG', {
      formatter: log.formatters.jsonFormatter,
      useColors: false,
    }),
  },
})

const { fetchDB } = initMinio()

const dbPath = './digest.db'
await fetchDB(dbPath)

const store = new Store(dbPath)
await generateIndex(store, './public/digest.index.json')
