import { z, zodResponseFormat } from '../../deps.ts'
import { OpenAI, PQueue, PRetry, ZodType, delay, log } from '../../deps.ts'
import { ContentKind } from '../types.ts'
import { requireEnv } from './config.ts'

const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY')

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const openaiQueue = new PQueue({
  concurrency: 10,
  interval: 5000,
  intervalCap: 10,
})

export const summarizePrompt = (
  title: string,
  content: string,
  kind: ContentKind,
) =>
  `
Summarize the following ${kind} in a single sentence using 16 words or less. Also, extract 3 key bulleted points. Use active tense. Use markdown, but do not use bold or italic.

${kind} title: ${title}

${kind} content:

${content}
`.trim()

export const summarizeChildPrompt = (
  title: string,
  summary: string,
  content: string,
  kind: ContentKind,
) =>
  `
Summarize the following discussion about a ${kind} in 2 bulleted points. Use active tense. Use markdown, but do not use bold or italic. Do not include information from the title or summary. Do not use the terms "participants", "users", or "community members" to refer to commenters: refer to them as "commenters".

${kind} title: ${title}

${kind} summary:

${summary}

Discussion about ${kind}:

${content}
`.trim()

export const classifyPrompt = (title: string, content: string) =>
  `
First, check if the page returned an error or access denied instead of real content. If so, return isError=true. Technical articles about errors or debugging should not be considered errors. If the user must subscribe to view the content (a paywall), return isError=false and isPaywall=true.

Please classify the following article by scoring the following as a floating point number between 1 and 5:

surprising: How surprising or unusual the content is.
current_event: Whether the content describes and important and recent current event.
newsworthy: Whether the content would be considered important news.
world_impact: News story with a significant global impact to a large number of people. 5 would be an emergency that impacts multiple countries and millions of people. Lower score for local news specific to a single person, state, or country. Lower score for human interest stories.
ffluff: Rate whether the content is insubstantial or lacks importance. Serious content with depth is not fluff. Code repositories are not fluff. Software documentation is not fluff.
marketing: Whether the content is marketing a specific product or service.
ragebait: Content intended to provoke drama, hate, or anger.
clickbait: Deceptive or exaggerated title or claims.
vague_title: Score 5 if the main topic of the content is not in the title.
disturbing: Gory, disturbing, or misanthropic content.

Also, please classify the content using the following text labels:

category: The overall category for the content, or none.
keywords: A list of important terms and topics for search.
title: Write a new title for the story based on the content. Use specific terms from the article. Be concise. Use direct, present tense, declarative language. Use sentence case.

The content is as follows:

Title: ${title}

Article content:

${content}
`.trim()

export const ClassifySchema = z.object({
  isError: z.boolean(),
  isPaywall: z.boolean(),
  scores: z.object({
    surprising: z.number(),
    current_event: z.number(),
    newsworthy: z.number(),
    world_impact: z.number(),
    fluff: z.number(),
    marketing: z.number(),
    ragebait: z.number(),
    clickbait: z.number(),
    vague_title: z.number(),
    disturbing: z.number(),
  }),
  category: z
    .enum([
      'world_news',
      'local_news',
      'tech',
      'science',
      'art',
      'culture',
      'sports',
    ])
    .nullable(),
  keywords: z.array(z.string()),
  title: z.string(),
})

function callOpenAI<T>(
  callback: (openai: OpenAI) => T,
  logInfo: Record<string, any>,
) {
  return PRetry(
    () =>
      openaiQueue.add(async () => {
        log.info(`fetching openai ${logInfo.kind ?? 'prompt'}`, logInfo)
        try {
          return callback(openai)
        } catch (err) {
          if (err.code === 'rate_limit_exceeded' && !openaiQueue.isPaused) {
            const retryAfterMs = Number(err.headers['retry-after-ms'])
            log.info(`waiting ${retryAfterMs}ms for OpenAI ratelimit`)
            openaiQueue.pause()
            await delay(retryAfterMs)
            openaiQueue.start()
          }
          throw err
        }
      }),
    { retries: 5 },
  )
}

export async function llm(
  prompt: string,
  { model = 'gpt-4o-mini' }: { model?: OpenAI.ChatModel } = {},
) {
  const resp = await callOpenAI(
    (openai) => {
      return openai.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model,
      })
    },
    { length: prompt.length },
  )

  const result = resp?.choices[0].message.content
  return result
}

export async function llmParse(prompt: string, schema: ZodType, name: string) {
  const resp = await callOpenAI(
    (openai) => {
      return openai.beta.chat.completions.parse({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'gpt-4o-mini',
        response_format: zodResponseFormat(schema, name),
      })
    },
    { kind: name, length: prompt.length },
  )

  if (!resp) {
    return null
  }

  const message = resp.choices[0].message

  const refusal = message.refusal
  if (refusal) {
    throw new Error(`OpenAI refusal: ${refusal}`)
  }

  return message.parsed
}

export function classifyContent(title: string, content: string) {
  return llmParse(classifyPrompt(title, content), ClassifySchema, 'classify')
}
