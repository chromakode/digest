import { log, path } from '../deps.ts'
import 'https://deno.land/std@0.224.0/dotenv/load.ts'

import { HNSource } from './lib/sources/hn.ts'
import { feedsFromOPML } from './lib/sources/feed.ts'
import { TildesSource } from './lib/sources/tildes.ts'
import { Store } from './lib/storage.ts'
import {
  classifyContent,
  llm,
  summarizeChildPrompt,
  summarizePrompt,
} from './lib/openai.ts'
import { Content, Source, SourceStatus } from './types.ts'
import { initMinio } from './lib/minio.ts'
import { DigestSource, digestIntervalMs } from './lib/sources/digest.ts'
import { PQueue } from '../deps.ts'
import { fetchWithUA } from './lib/fetch.ts'
import { podcastsFromOPML } from './lib/sources/podcast.ts'
import { filterContent } from '@shared/filterContent.ts'

const OUTPUT_DIR = Deno.env.get('OUTPUT_DIR') ?? './output'
const SITE_BUILD_HOOK = Deno.env.get('SITE_BUILD_HOOK')

const startTime = performance.now()

log.setup({
  handlers: {
    default: new log.ConsoleHandler('DEBUG', {
      formatter: log.formatters.jsonFormatter,
      useColors: false,
    }),
  },
})

const { fetchDB, uploadDBFile, uploadDBSnapshot } = initMinio()

Deno.mkdir(OUTPUT_DIR, { recursive: true })
const dbPath = path.join(OUTPUT_DIR, 'digest.db')
await fetchDB(dbPath)
const store = new Store(dbPath)

const writeQueue = new PQueue({
  concurrency: 1,
  interval: 10000,
  intervalCap: 1,
})

// Periodically upload snapshots of the DB so if the job crashes after some long running transcriptions, progress isn't lost.
function queueWrite() {
  if (writeQueue.size > 0) {
    return
  }

  writeQueue.add(async () => {
    await uploadDBSnapshot(store, OUTPUT_DIR)
  })
}

async function classifyAndSummarize(content: Content) {
  await Promise.all([fetchSummary(content), fetchClassifyResult(content)])
}

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
    contentSummary = await llm(prompt)
  } catch (err) {
    log.error('error fetching summary', {
      contentId: content.id,
      err,
      msg: err.toString(),
    })
    return
  }

  if (!contentSummary) {
    return
  }

  store.addSummary(content.id, { contentSummary })
}

async function fetchClassifyResult(content: Content) {
  if (store.getClassifyResult(content.id)) {
    return
  }

  if (content.parentContentId) {
    return
  }

  const contentBody = content.content.substring(0, 50000)

  let classifyResult
  try {
    classifyResult = await classifyContent(content.title, contentBody)
  } catch (err) {
    log.error('error fetching classify', {
      contentId: content.id,
      err,
      msg: err.toString(),
    })
    return
  }

  if (!classifyResult) {
    return
  }

  store.addClassifyResult(content.id, { classifyResult })
}

async function fetchSource(source: Source) {
  log.info('fetching source', { id: source.id })

  const sourceStore = store.withSource(source.id, {
    onContent: classifyAndSummarize,
  })

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
  queueWrite()
}

async function fetchAll() {
  const feeds = await feedsFromOPML('./feeds.opml')
  const podcasts = await podcastsFromOPML('./podcasts.opml')
  const sources = [new HNSource(), new TildesSource(), ...feeds, ...podcasts]

  const fetchPromises = sources
    .filter(({ id }) => !store.isSourceFresh(id))
    .map(fetchSource)
  await Promise.allSettled(fetchPromises)

  return fetchPromises.length
}

async function summarizeAllMissing() {
  const summarizePromises = store
    .getContentMissingSummary()
    .map(classifyAndSummarize)
  await Promise.allSettled(summarizePromises)
}

async function triggerSiteBuild() {
  if (SITE_BUILD_HOOK) {
    await fetchWithUA(SITE_BUILD_HOOK, { method: 'POST' })
    log.info('triggered site build')
  }
}

await fetchAll()
await summarizeAllMissing()
await fetchSource(
  new DigestSource(
    store
      .getContentWithChildSummaries({
        since: { seconds: digestIntervalMs / 1000 },
      })
      .filter((row) => filterContent(row.classifyResult)),
  ),
)

const durationMs = performance.now() - startTime
store.addSourceResult('system', { status: SourceStatus.SUCCESS, durationMs })

await writeQueue.onIdle()
store.close()

await uploadDBFile(dbPath)

await triggerSiteBuild()

log.info(`finished in ${durationMs}ms`)
