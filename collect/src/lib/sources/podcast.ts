import { log } from '../../../deps.ts'
import { transcribeAudio } from '../runpod.ts'
import { ContentData, SourceId, SourceStore } from '../../types.ts'
import { FeedSource, readOPML, RSSItem } from './feed.ts'

export class PodcastSource extends FeedSource {
  get id() {
    return `podcast:${this.slug}` as SourceId
  }

  itemData(item: RSSItem): Omit<ContentData, 'content'> | null {
    const data = super.itemData(item)
    if (!data || !item.enclosure?.url) {
      return null
    }
    return {
      ...data,
      url: item.enclosure.url,
    }
  }

  async fetchItem(
    data: Omit<ContentData, 'content'>,
    item: RSSItem,
    store: SourceStore,
  ) {
    const { url } = data
    log.info('fetching podcast episode', { guid: item.guid, url })
    const text = await transcribeAudio(url)
    return await store.addContent({
      ...data,
      content: text,
    })
  }
}

export async function podcastsFromOPML(path: string): Promise<PodcastSource[]> {
  const feeds = await readOPML(path)
  return feeds.map(({ slug, url }) => new PodcastSource(slug, url))
}
