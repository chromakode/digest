import { Element, log } from '../../../deps.ts'
import { Source, SourceId, SourceStatus, SourceStore } from '../../types.ts'
import { relativeURL, tryDate } from '../utils.ts'
import { fetchDocument, fetchPage } from '../web.ts'

const BASE_URL = 'https://tildes.net'

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
      const url = relativeURL(linkEl?.getAttribute('href'), BASE_URL)

      if (!linkEl || !url || store.isContentFresh({ url })) {
        continue
      }

      const title = linkEl?.textContent
      const timeEl = el.querySelector('time')
      const contentTimestamp = tryDate(timeEl?.getAttribute('datetime'))

      const commentsEl = el.querySelector('.topic-info-comments a')
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

    store.updateSource({ name: 'Tildes' })

    await Promise.all(fetches)
    return SourceStatus.SUCCESS
  }
}
