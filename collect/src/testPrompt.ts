import { assert, parseArgs, path } from '../deps.ts'
import 'https://deno.land/std@0.224.0/dotenv/load.ts'
import {
  classifyContent,
  llm,
  summarizeChildPrompt,
  summarizePrompt,
} from './lib/openai.ts'
import { Store } from './lib/storage.ts'
import { Content, ContentWithSummary } from './types.ts'

const OUTPUT_DIR = Deno.env.get('OUTPUT_DIR') ?? './output'

const dbPath = path.join(OUTPUT_DIR, 'digest.db')
const store = new Store(dbPath)

async function summarize() {
  const content = store.db.queryEntries<Content>(
    'SELECT contentId as id, title, content FROM content WHERE (SELECT COUNT(1) FROM content c2 WHERE c2.parentContentId = content.contentId) > 0 LIMIT 1',
  )[0]

  assert(content)

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

  console.log(content.title, '\n')
  console.log(contentSummary)

  console.log('\nfrom', childContent.sourceId)
  console.log(childContentSummary)
}

async function classify() {
  const content = store.db.queryEntries<ContentWithSummary>(
    'SELECT contentId as id, title, content, contentSummary FROM content LEFT JOIN summary USING (contentId) WHERE parentContentId IS NULL ORDER BY RANDOM() LIMIT 1',
  )[0]

  assert(content)

  const contentBody = content.content.substring(0, 50000)
  const classification = await classifyContent(content.title, contentBody)
  console.log(content.id, ':', content.title, '\n')
  console.log(content.contentSummary)
  console.log(classification)
}

const args = parseArgs(Deno.args)
const commands = new Map(Object.entries({ summarize, classify }))
const commandName = String(args._[0])
commands.get(commandName)?.()
