import { dateFns, encodeBase64 } from '../../../deps.ts'
import {
  ContentKind,
  ContentWithChildren,
  Source,
  SourceId,
  SourceStatus,
  SourceStore,
} from '../../types.ts'
import { llm } from '../openai.ts'
import { digestIntervalMs } from '@shared/constants.ts'

const summarizeDigestPrompt = (summaries: string) => `
Given the following list of news items, summarize most important news into a single short paragraph. Include specific titles and link them to the url using markdown syntax.
Links must wrap multiple words from the summary. Instead of putting links in parentheses, work them into the prose. Instead of linking the text "here" or the name of a source, link multiple words about the news item. Prefer linking more words where possible, ideally 5-6 words in the text of a link. Do not format with bold or italic. Use active tense.

For example:

Key news stories include the closure of [Game Informer](https://www.ign.com/articles/game-informer-to-shut-down-after-33-years) after 33 years, impacting the gaming journalism landscape amid financial struggles at GameStop. In legal news, the [US Fifth Circuit Court](https://www.nytimes.com/2024/08/02/us/texas-voting-rights-minorities.html?unlocked_article_code=1._00.ewqZ.lANUItcW1l_7) narrows the scope of the Voting Rights Act, affecting minority voting rights by ruling that minorities cannot jointly claim voting dilution. Additionally, a [Mercedes EV fire](https://koreajoongangdaily.joins.com/news/2024-08-02/business/industry/Mercedes-EV-fire-causes-power-outage-hospitalizations-with-140-cars-damaged/2104634) in Incheon results in significant damage, leading to power outages and hospitalizations. Finally, secret negotiations manage the release of journalist [Evan Gershkovich](https://www.wsj.com/world/europe/evan-gershkovich-prisoner-exchange-ccb39ad3) from Russian custody, underscoring ongoing geopolitical tensions.

News items:

${summaries}
`

export async function createDigestPrompt(content: ContentWithChildren[]) {
  const now = Date.now()
  const digestIndex = Math.ceil(now / digestIntervalMs)

  const digestBase = (digestIndex - 1) * digestIntervalMs

  const digestStart = Math.min(
    digestBase,
    dateFns.subMilliseconds(now, digestIntervalMs).getTime(),
  )

  const digestURL = `digest://${digestIndex}`

  const digestContent = content.filter(
    ({ timestamp, sourceId }) =>
      new Date(timestamp + 'Z').getTime() > digestStart &&
      sourceId !== DigestSource.id,
  )

  if (!digestContent.length) {
    return { digestURL, hash: null, prompt: null }
  }

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

  return { digestURL, hash, prompt }
}

export class DigestSource implements Source {
  latestContent: ContentWithChildren[]
  static id = 'digest' as SourceId
  id = DigestSource.id

  constructor(latestContent: ContentWithChildren[]) {
    this.latestContent = latestContent
  }

  async fetch(store: SourceStore) {
    const { digestURL, hash, prompt } = await createDigestPrompt(
      this.latestContent,
    )

    if (
      prompt == null ||
      store.getFreshContentId({ url: digestURL, hash, delta: { years: 100 } })
    ) {
      return SourceStatus.SUCCESS
    }

    const contentSummary = await llm(summarizeDigestPrompt(prompt), {
      model: 'gpt-4o',
    })

    const { id } = await store.addContent({
      url: digestURL,
      hash,
      title: 'Digest',
      content: '',
      kind: 'digest',
    })

    if (contentSummary) {
      await store.addSummary(id, { contentSummary })
    }

    store.updateSource({ name: 'Digest', shortName: 'Digest' })

    return SourceStatus.SUCCESS
  }
}
