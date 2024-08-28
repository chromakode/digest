import { assert, dateFns, log, RSSParser, slug, xml } from '../../../deps.ts'
import { transcribeAudio } from '../runpod.ts'
import {
  Content,
  Source,
  SourceId,
  SourceStatus,
  SourceStore,
} from '../../types.ts'
import { tryDate } from '../utils.ts'
import { getFetchQueue } from '../web.ts'
import { fetchWithUA } from '../fetch.ts'

const rssParser = new RSSParser()

const loadThreshold: dateFns.Duration = { days: 3 }

export class PodcastSource implements Source {
  slug: string
  feedURL: string

  get id() {
    return `podcast:${this.slug}` as SourceId
  }

  constructor(slug: string, url: string) {
    this.slug = slug
    this.feedURL = url
  }

  async fetch(store: SourceStore) {
    const { slug, feedURL } = this
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
      if (
        !item.isoDate ||
        new Date(item.isoDate) < threshold ||
        !item.enclosure
      ) {
        continue
      }

      const url = item.enclosure.url

      const contentId = item.guid ? { hash: item.guid } : { url }
      if (store.getFreshContentId({ ...contentId, delta: { years: 100 } })) {
        continue
      }

      log.info('fetching podcast episode', { guid: item.guid, url })

      fetches.push(
        transcribeAudio(url).then((text) =>
          store.addContent({
            url,
            sourceURL: item.link,
            title: item.title ?? 'untitled',
            author: item.author,
            contentTimestamp: tryDate(item.isoDate),
            content: text,
            hash: item.guid,
          }),
        ),
      )
    }

    store.updateSource({ name: rssData.title ?? slug })

    await Promise.all(fetches)
    return SourceStatus.SUCCESS
  }
}

export async function readOPML(path: string): Promise<PodcastSource[]> {
  const opmlText = await Deno.readTextFile(path)
  const opmlData = await xml.parse(opmlText)

  // deno-lint-ignore no-explicit-any
  return (opmlData.opml as any).body.outline.outline.map(
    (el: Record<string, string>) =>
      new PodcastSource(slug(el['@text']), el['@xmlUrl']),
  )
}
