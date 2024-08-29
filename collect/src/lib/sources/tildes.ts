import { Element, log } from '../../../deps.ts'
import { Source, SourceId, SourceStatus, SourceStore } from '../../types.ts'
import { relativeURL, tryDate } from '../utils.ts'
import { fetchDocument, fetchPage } from '../web.ts'

const BASE_URL = 'https://tildes.net'
const MIN_COMMENT_COUNT = 1

function sanitizeTildesURL(urlStr: string | null | undefined) {
  if (!urlStr) {
    return
  }

  /** Remove the slug from Tildes comments URLs, since it may change */
  const url = new URL(urlStr)
  if (url.origin === BASE_URL) {
    const match = url.pathname.match(/(\/~\w+\/\w+\/)\w+/)
    if (match) {
      url.pathname = match[1]
      return url.toString()
    }
  }

  return urlStr
}

export class TildesSource implements Source {
  id = 'tildes' as SourceId

  async fetch(store: SourceStore) {
    const fetches: Array<Promise<void>> = []

    const doc = await fetchDocument(BASE_URL)
    if (!doc) {
      log.error('could not fetch Tildes')
      return SourceStatus.ERROR
    }

    const things = doc.querySelectorAll<Element>('article')
    for (const thing of [...things]) {
      const el = thing as Element
      const linkEl = el.querySelector('.topic-title a')
      const url = sanitizeTildesURL(
        relativeURL(linkEl?.getAttribute('href'), BASE_URL),
      )

      if (!linkEl || !url) {
        continue
      }

      const title = linkEl?.textContent
      const timeEl = el.querySelector('time')
      const contentTimestamp = tryDate(timeEl?.getAttribute('datetime'))

      const commentsEl = el.querySelector('.topic-info-comments a')
      const commentCountText = commentsEl?.textContent.match(/^\d+/)?.[0]
      const commentCount =
        commentCountText != null ? parseInt(commentCountText) : 0
      const sourceURL = sanitizeTildesURL(
        relativeURL(commentsEl?.getAttribute('href'), BASE_URL),
      )

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
          sourceURL !== url &&
          !store.getFreshContentId({ url: sourceURL, delta: { hours: 3 } })
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

    store.updateSource({ name: 'Tildes' })

    await Promise.all(fetches)
    return SourceStatus.SUCCESS
  }
}
