import { assert, path } from '../deps.ts'
import 'https://deno.land/std@0.224.0/dotenv/load.ts'
import {
  summarize,
  summarizeChildPrompt,
  summarizePrompt,
} from './lib/openai.ts'
import { Store } from './lib/storage.ts'
import { Content } from './types.ts'

const OUTPUT_DIR = Deno.env.get('OUTPUT_DIR') ?? './output'

const dbPath = path.join(OUTPUT_DIR, 'digest.db')
const store = new Store(dbPath)

const content = store.db.queryEntries<Content>(
  'SELECT contentId as id, title, content FROM content WHERE (SELECT COUNT(1) FROM content c2 WHERE c2.parentContentId = content.contentId) > 0 LIMIT 1',
)[0]

assert(content)

const contentBody = content.content.substring(0, 50000)
const contentSummary = await summarize(
  summarizePrompt(content.title, contentBody),
)

const childContent = store.db.queryEntries<Content>(
  'SELECT title, content, sourceId FROM content WHERE parentContentId=:parentContentId LIMIT 1',
  { parentContentId: content.id },
)[0]

const childContentBody = childContent.content.substring(0, 50000)
const childContentSummary = await summarize(
  summarizeChildPrompt(childContent.title, contentSummary, childContentBody),
)

console.log(content.title, '\n')
console.log(contentSummary)

console.log('\nfrom', childContent.sourceId)
console.log(childContentSummary)
