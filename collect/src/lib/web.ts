import { DOMParser, PQueue, assert, log, parseMediaType } from '../../deps.ts'
import { ContentData } from '../types.ts'
import { fetchWithUA } from './fetch.ts'

const defaultQueueOptions = {
  concurrency: 1,
  interval: 500,
  intervalCap: 1,
}

// TODO: LRU if we ever have long running processes
const originMap: Map<string, PQueue> = new Map()

export function getFetchQueue(url: string): PQueue {
  const { origin } = new URL(url)

  if (!originMap.has(origin)) {
    originMap.set(origin, new PQueue(defaultQueueOptions))
  }

  return originMap.get(origin)!
}

export async function fetchDocument(url: string) {
  const resp = await getFetchQueue(url).add(() => {
    log.info(`web fetch ${url}`, { url })
    return fetchWithUA(url)
  })

  assert(resp != null)
  const contentType = parseMediaType(resp.headers.get('Content-Type') ?? '')
  if (contentType[0] !== 'text/html' && contentType[0] !== 'text/xhtml+xml') {
    log.warn('unknown content type', contentType)
    return
  }
  const html = await resp.text()
  return new DOMParser().parseFromString(html, 'text/html')
}

export async function fetchPage(url: string): Promise<ContentData> {
  const doc = await fetchDocument(url)
  if (!doc) {
    return {
      url,
      title: 'unknown',
      content: '',
      kind: 'error',
    }
  }

  doc
    .querySelectorAll('script, style')
    .forEach((el) => el.parentNode?.removeChild(el))

  // TODO: support common author / post microdata and social metadata
  const author = doc.querySelector('[itemprop=author]')?.textContent.trim()
  const text = (
    doc.querySelector('[itemprop=text]') ?? doc.body
  ).textContent.trim()

  return {
    url,
    title: doc.title,
    author,
    content: text,
    kind: 'article',
  }
}
