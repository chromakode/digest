import { Element, log } from '../../../deps.ts'
import { Source, SourceId, SourceStatus, SourceStore } from '../../types.ts'
import { relativeURL, tryDate } from '../utils.ts'
import { fetchDocument, fetchPage } from '../web.ts'

const BASE_URL = 'https://news.ycombinator.com'

export class HNSource implements Source {
  id = 'hn' as SourceId

  async fetch(store: SourceStore) {
    const fetches: Array<Promise<void>> = []

    const doc = await fetchDocument(BASE_URL)
    if (!doc) {
      log.error('could not fetch Hacker News')
      return SourceStatus.ERROR
    }

    const things = doc.querySelectorAll<Element>('.athing')
    for (const thing of [...things]) {
      const el = thing as Element
      const linkEl = el.querySelector('.titleline a')
      const url = linkEl?.getAttribute('href')

      // Hiring ads don't have these
      const subLineEl = el.nextElementSibling?.querySelector('.subline')

      if (!linkEl || !subLineEl || !url || store.isContentFresh({ url })) {
        continue
      }

      const title = linkEl?.textContent

      const timeEl = el.nextElementSibling?.querySelector('.age')
      const contentTimestamp = tryDate(timeEl?.getAttribute('title') + 'Z')

      const commentsEl = el.nextElementSibling?.querySelector(
        '.subline a:last-child',
      )
      const sourceURL = relativeURL(commentsEl?.getAttribute('href'), BASE_URL)

      const fetchContent = async () => {
        const page = await fetchPage(url)
        const { id } = await store.addContent({
          ...page,
          title,
          contentTimestamp,
          sourceURL,
        })
        if (sourceURL && sourceURL !== url) {
          const commentsPage = await fetchPage(sourceURL)
          await store.addContent({
            ...commentsPage,
            title: 'comments',
            contentTimestamp,
            sourceURL,
            parentContentId: id,
          })
        }
      }
      fetches.push(fetchContent())
    }

    store.updateSource({ name: 'Hacker News', shortName: 'HN' })

    await Promise.all(fetches)
    return SourceStatus.SUCCESS
  }
}
