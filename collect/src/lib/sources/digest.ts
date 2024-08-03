import { dateFns, encodeBase64 } from '../../../deps.ts'
import {
  ContentWithChildren,
  Source,
  SourceId,
  SourceStatus,
  SourceStore,
} from '../../types.ts'
import { summarize } from '../openai.ts'

const interval = 4 * 60 * 60 * 1000

const summarizeDigestPrompt = (summaries: string) => `
Given the following list of news items, summarize most important news into a single short paragraph. Include specific titles and link them to the url using markdown syntax, without bold or italic. Use active tense.

${summaries}
`

export class DigestSource implements Source {
  latestContent: ContentWithChildren[]
  static id = 'digest' as SourceId
  id = DigestSource.id

  constructor(latestContent: ContentWithChildren[]) {
    this.latestContent = latestContent
  }

  async fetch(store: SourceStore) {
    const now = Date.now()
    const digestIndex = Math.ceil(now / interval)

    const digestBase = (digestIndex - 1) * interval

    // The latest digest should always cover at least a half interval of recent content.
    const digestStart = Math.min(
      digestBase,
      dateFns.subMilliseconds(now, interval / 2).getTime(),
    )

    const digestURL = `digest://${digestIndex}`

    const digestContent = this.latestContent.filter(
      ({ timestamp }) => new Date(timestamp + 'Z').getTime() > digestStart,
    )
    const contentSummaries = digestContent
      .map(
        ({ title, contentSummary, url }) =>
          `${url} ${title}: ${contentSummary}`,
      )
      .join('\n\n')
    const prompt = summarizeDigestPrompt(contentSummaries)

    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(prompt),
    )
    const hash = encodeBase64(hashBuffer)

    if (store.isContentFresh({ url: digestURL, hash, delta: { years: 100 } })) {
      return SourceStatus.SUCCESS
    }

    const contentSummary = await summarize(summarizeDigestPrompt(prompt))

    const { id } = await store.addContent({
      url: digestURL,
      hash,
      title: 'Digest',
      content: '',
    })
    await store.addSummary(id, { contentSummary })

    store.updateSource({ name: 'Digest', shortName: 'Digest' })

    return SourceStatus.SUCCESS
  }
}
