import { Element, log } from '../../../deps.ts'
import { Source, SourceId, SourceStatus, SourceStore } from '../../types.ts'
import { relativeURL, tryDate } from '../utils.ts'
import { fetchDocument, fetchPage } from '../web.ts'

const BASE_URL = 'https://news.ycombinator.com'
const MIN_COMMENT_COUNT = 3

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

      if (!linkEl || !subLineEl || !url) {
        continue
      }

      const title = linkEl?.textContent

      const timeEl = el.nextElementSibling?.querySelector('.age')
      const contentTimestamp = tryDate(timeEl?.getAttribute('title') + 'Z')

      const commentsEl = el.nextElementSibling?.querySelector(
        '.subline a:last-child',
      )
      const commentCountText = commentsEl?.textContent.match(/^\d+/)?.[0]
      const commentCount =
        commentCountText != null ? parseInt(commentCountText) : 0
      const sourceURL = relativeURL(commentsEl?.getAttribute('href'), BASE_URL)

      const fetchContent = async () => {
        let parentContentId = store.getFreshContentId({ url })
        if (!parentContentId) {
          const page = await fetchPage(url)
          const { id: newId } = await store.addContent({
            ...page,
            title,
            contentTimestamp,
            sourceURL,
          })
          parentContentId = newId
        }

        if (
          commentCount > MIN_COMMENT_COUNT &&
          sourceURL != null &&
          sourceURL != url &&
          !store.getFreshContentId({ url: sourceURL, delta: { hours: 0 } })
        ) {
          const commentsPage = await fetchPage(sourceURL)
          await store.addContent({
            ...commentsPage,
            title: 'comments',
            contentTimestamp,
            sourceURL,
            parentContentId,
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
