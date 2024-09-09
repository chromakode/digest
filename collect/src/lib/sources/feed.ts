import { assert, dateFns, log, RSSParser, slug, xml } from '../../../deps.ts'
import {
  Content,
  ContentData,
  ContentKind,
  Source,
  SourceId,
  SourceStatus,
  SourceStore,
} from '../../types.ts'
import { tryDate } from '../utils.ts'
import { fetchPage, getFetchQueue } from '../web.ts'
import { fetchWithUA } from '../fetch.ts'

const rssParser = new RSSParser()

const loadThreshold: dateFns.Duration = { days: 3 }

export type RSSItem = Record<string, any> & RSSParser.Item

export class FeedSource implements Source {
  name: string
  feedURL: string

  get slug() {
    return slug(this.name)
  }

  get id() {
    return `feed:${this.slug}` as SourceId
  }

  constructor(name: string, url: string) {
    this.name = name
    this.feedURL = url
  }

  async fetch(store: SourceStore) {
    const { name, slug, feedURL } = this
    const resp = await getFetchQueue(feedURL).add(() => {
      log.info('feed fetch', { slug, feedURL })
      return fetchWithUA(feedURL)
    })
    assert(resp != null)
    const rssText = await resp.text()
    const rssData = await rssParser.parseString(rssText)

    const threshold = dateFns.sub(Date.now(), loadThreshold)
    const fetches: Array<Promise<Content>> = []
    for (const item of rssData.items) {
      if (!item.isoDate || new Date(item.isoDate) < threshold) {
        continue
      }

      const data = this.itemData(item)
      if (!data) {
        continue
      }

      const { url, hash } = data
      const contentId = hash ? { hash } : { url }
      if (store.getFreshContentId({ ...contentId, delta: { years: 100 } })) {
        continue
      }

      fetches.push(this.fetchItem(data, item, store))
    }

    store.updateSource({ name })

    await Promise.all(fetches)
    return SourceStatus.SUCCESS
  }

  itemData(item: RSSItem): Omit<ContentData, 'content'> | null {
    if (!item.link) {
      return null
    }

    return {
      url: item.link,
      sourceURL: item.link,
      title: item.title ?? 'untitled',
      author: item.author,
      contentTimestamp: tryDate(item.isoDate),
      hash: item.guid,
      kind: 'article',
    }
  }

  async fetchItem(
    data: Omit<ContentData, 'content'>,
    item: RSSItem,
    store: SourceStore,
  ) {
    const { url } = data
    log.info('fetching feed item', { guid: item.guid, url })
    const page = await fetchPage(url)
    return await store.addContent({
      ...page,
      ...data,
      title: data.title ?? page.title,
      author: data.author ?? page.author,
    })
  }
}

export interface FeedInfo {
  name: string
  url: string
}

export async function readOPML(path: string): Promise<FeedInfo[]> {
  const opmlText = await Deno.readTextFile(path)
  const opmlData = await xml.parse(opmlText)

  // deno-lint-ignore no-explicit-any
  return (opmlData.opml as any).body.outline.outline.map(
    (el: Record<string, string>) => ({
      name: el['@text'],
      url: el['@xmlUrl'],
    }),
  )
}

export async function feedsFromOPML(path: string): Promise<FeedSource[]> {
  const feeds = await readOPML(path)
  return feeds.map(({ name, url }) => new FeedSource(name, url))
}
