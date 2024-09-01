import { dateFns, encodeBase64 } from '../../../deps.ts'
import {
  ContentWithChildren,
  Source,
  SourceId,
  SourceStatus,
  SourceStore,
} from '../../types.ts'
import { llm } from '../openai.ts'

const interval = 4 * 60 * 60 * 1000

const summarizeDigestPrompt = (summaries: string) => `
Given the following list of news items, summarize most important news into a single short paragraph. Include specific titles and link them to the url using markdown syntax, without bold or italic. Use active tense.

For example:

Key news stories include the closure of [Game Informer](https://www.ign.com/articles/game-informer-to-shut-down-after-33-years) after 33 years, impacting the gaming journalism landscape amid financial struggles at GameStop. In legal news, the [US Fifth Circuit Court](https://www.nytimes.com/2024/08/02/us/texas-voting-rights-minorities.html?unlocked_article_code=1._00.ewqZ.lANUItcW1l_7) narrows the scope of the Voting Rights Act, affecting minority voting rights by ruling that minorities cannot jointly claim voting dilution. Additionally, a [Mercedes EV fire](https://koreajoongangdaily.joins.com/news/2024-08-02/business/industry/Mercedes-EV-fire-causes-power-outage-hospitalizations-with-140-cars-damaged/2104634) in Incheon results in significant damage, leading to power outages and hospitalizations. Finally, secret negotiations manage the release of journalist [Evan Gershkovich](https://www.wsj.com/world/europe/evan-gershkovich-prisoner-exchange-ccb39ad3) from Russian custody, underscoring ongoing geopolitical tensions.

News items:

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
      .map(({ title, contentSummary, url, childContent }) => {
        const comments = childContent.map((c) => c.contentSummary).join('\n')
        return `${url} ${title}: ${contentSummary}\n${comments} `
      })
      .join('\n\n')
    const prompt = summarizeDigestPrompt(contentSummaries)

    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(prompt),
    )
    const hash = encodeBase64(hashBuffer)

    if (
      store.getFreshContentId({ url: digestURL, hash, delta: { years: 100 } })
    ) {
      return SourceStatus.SUCCESS
    }

    const contentSummary = await llm(summarizeDigestPrompt(prompt))

    const { id } = await store.addContent({
      url: digestURL,
      hash,
      title: 'Digest',
      content: '',
    })

    if (contentSummary) {
      await store.addSummary(id, { contentSummary })
    }

    store.updateSource({ name: 'Digest', shortName: 'Digest' })

    return SourceStatus.SUCCESS
  }
}
