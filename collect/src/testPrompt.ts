import { assert, parseArgs, path } from '../deps.ts'
import 'https://deno.land/std@0.224.0/dotenv/load.ts'
import {
  classifyContent,
  llm,
  summarizeChildPrompt,
  summarizePrompt,
} from './lib/openai.ts'
import { Store } from './lib/storage.ts'
import { Content, ContentId, ContentWithSummary } from './types.ts'
import { createDigestPrompt } from './lib/sources/digest.ts'
import { filterContent } from '@shared/filterContent.ts'
import { digestIntervalMs } from '@shared/constants.ts'

const OUTPUT_DIR = Deno.env.get('OUTPUT_DIR') ?? './output'

const dbPath = path.join(OUTPUT_DIR, 'digest.db')
const store = new Store(dbPath)

async function summarize(contentId?: ContentId) {
  const content =
    contentId != null
      ? store.db.queryEntries<Content>(
          `SELECT contentId as id, title, content FROM content WHERE contentId = :contentId`,
          { contentId },
        )[0]
      : store.db.queryEntries<Content>(
          `SELECT content.contentId as id, content.title, content.content FROM content LEFT JOIN content childContent ON (childContent.parentContentId = content.contentId) WHERE childContent.contentId IS NOT NULL ORDER BY RANDOM() LIMIT 1`,
        )[0]

  const contentBody = content.content.substring(0, 50000)
  const contentSummary = await llm(summarizePrompt(content.title, contentBody))

  const childContent = store.db.queryEntries<Content>(
    'SELECT title, content, sourceId FROM content WHERE parentContentId=:parentContentId LIMIT 1',
    { parentContentId: content.id },
  )[0]

  const childContentBody = childContent.content.substring(0, 50000)
  const childContentSummary = await llm(
    summarizeChildPrompt(
      childContent.title,
      contentSummary ?? '',
      childContentBody,
    ),
  )

  console.log(content.id, ':', content.title, '\n')
  console.log(contentSummary)

  console.log('\nfrom', childContent.sourceId)
  console.log(childContentSummary)
}

async function classify(contentId?: ContentId) {
  const content =
    contentId != null
      ? store.db.queryEntries<ContentWithSummary>(
          'SELECT contentId as id, title, content, contentSummary FROM content LEFT JOIN summary USING (contentId) WHERE contentId = :contentId',
          { contentId },
        )[0]
      : store.db.queryEntries<ContentWithSummary>(
          'SELECT contentId as id, title, content, contentSummary FROM content LEFT JOIN summary USING (contentId) WHERE parentContentId IS NULL ORDER BY RANDOM() LIMIT 1',
        )[0]

  assert(content)

  const contentBody = content.content.substring(0, 50000)
  const classification = await classifyContent(content.title, contentBody)
  console.log(content.id, ':', content.title, '\n')
  console.log(content.contentSummary)
  console.log(classification)
}

async function digest() {
  const contentToDigest = store
    .getContentWithChildSummaries({
      since: { seconds: digestIntervalMs / 1000 },
    })
    .filter((row) => filterContent(row.sourceId, row.classifyResult))

  const { prompt } = await createDigestPrompt(contentToDigest)
  if (prompt == null) {
    console.log('Nothing recent enough to digest')
    return
  }
  const contentSummary = await llm(prompt)
  console.log(contentSummary)
}

const args = parseArgs(Deno.args, { string: 'content-id' })
const commands = new Map(Object.entries({ summarize, classify, digest }))
const commandName = String(args._[0])
const contentId = args['content-id']
  ? (args['content-id'] as ContentId)
  : undefined
commands.get(commandName)?.(contentId)
