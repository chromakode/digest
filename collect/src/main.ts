import { log, path } from '../deps.ts'
import { HNSource } from './lib/sources/hn.ts'
import { readOPML } from './lib/sources/podcast.ts'
import { TildesSource } from './lib/sources/tildes.ts'
import { Store } from './lib/storage.ts'
import {
  summarize,
  summarizeChildPrompt,
  summarizePrompt,
} from './lib/openai.ts'
import { Content, Source, SourceStatus } from './types.ts'
import { fetchDB, uploadDB } from './lib/minio.ts'
import { OUTPUT_DIR, SITE_BUILD_HOOK } from './lib/config.ts'

const startTime = performance.now()

log.setup({
  handlers: {
    default: new log.ConsoleHandler('DEBUG', {
      formatter: log.formatters.jsonFormatter,
      useColors: false,
    }),
  },
})

Deno.mkdir(OUTPUT_DIR, { recursive: true })
const dbPath = path.join(OUTPUT_DIR, 'digest.db')
await fetchDB(dbPath)
const store = new Store(dbPath)

async function fetchSummary(content: Content) {
  if (store.getSummary(content.id)) {
    return
  }

  const contentBody = content.content.substring(0, 50000)
  let prompt: string
  if (content.parentContentId) {
    const contentSummary = store.getSummary(content.parentContentId)
    if (!contentSummary) {
      log.warn('skipping summarizing child with missing parent summary', {
        contentId: content.id,
      })
      return
    }
    prompt = summarizeChildPrompt(content.title, contentSummary, contentBody)
  } else {
    prompt = summarizePrompt(content.title, contentBody)
  }

  let contentSummary
  try {
    contentSummary = await summarize(prompt)
  } catch (err) {
    log.error('error fetching summary', {
      contentId: content.id,
      err,
      msg: err.toString(),
    })
    return
  }
  store.addSummary(content.id, { contentSummary })
}

async function fetchSource(source: Source) {
  log.info('fetching source', { id: source.id })

  const sourceStore = store.withSource(source.id, { onContent: fetchSummary })

  const startTime = performance.now()
  let status = SourceStatus.ERROR
  try {
    status = await source.fetch(sourceStore)
  } catch (err) {
    log.error('error fetching source', {
      source: source.id,
      err,
      msg: err.toString(),
      stack: err.stack,
    })
  }
  const durationMs = performance.now() - startTime

  store.addSourceResult(source.id, { status, durationMs })
}

async function fetchAll() {
  const feeds = await readOPML('./feeds.opml')
  const sources = [new HNSource(), new TildesSource(), ...feeds]

  const fetchPromises = sources
    .filter(({ id }) => !store.isSourceFresh(id))
    .map(fetchSource)
  await Promise.allSettled(fetchPromises)

  return fetchPromises.length
}

async function summarizeAllMissing() {
  const summarizePromises = store.getContentWithoutSummary().map(fetchSummary)
  await Promise.allSettled(summarizePromises)
}

async function triggerSiteBuild() {
  if (SITE_BUILD_HOOK) {
    await fetch(SITE_BUILD_HOOK, { method: 'POST' })
    log.info('triggered site build')
  }
}

await fetchAll()
await summarizeAllMissing()

const durationMs = performance.now() - startTime
store.addSourceResult('system', { status: SourceStatus.SUCCESS, durationMs })

store.close()
await uploadDB(OUTPUT_DIR)
await triggerSiteBuild()

log.info(`finished in ${durationMs}ms`)
