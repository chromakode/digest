import { z, zodResponseFormat } from '../../deps.ts'
import { OpenAI, PQueue, PRetry, ZodType, delay, log } from '../../deps.ts'
import { requireEnv } from './config.ts'

const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY')

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const openaiQueue = new PQueue({
  concurrency: 10,
  interval: 5000,
  intervalCap: 10,
})

export const summarizePrompt = (title: string, content: string) =>
  `
Summarize the following content in a single sentence using 16 words or less. Also, extract 3 key bulleted points. Use active tense. Use markdown, but do not use bold or italic.

Article title: ${title}

Article content:

${content}
`.trim()

export const summarizeChildPrompt = (
  title: string,
  summary: string,
  content: string,
) =>
  `
Summarize the following discussion in 2 bulleted points. Use active tense. Use markdown, but do not use bold or italic. Do not include information from the title or summary. Do not use the terms "participants", "users", or "community members" to refer to commenters: refer to them as "commenters".

Title: ${title}

Summary:

${summary}

Discussion:

${content}
`.trim()

export const classifyPrompt = (title: string, content: string) =>
  `
Please classify the following content by scoring the following attributes as a floating point number between 1 and 5.

surprising: How surprising or unusual the content is.
current_event: Whether the content describes and important and recent current event.
newsworthy: Whether the content would be considered important news.
world_impact: Whether the content describes an event or information which is extremely important to the world.
fluff: Rate whether the content is insubstantial or lacks importance.
marketing: Whether the content is marketing a specific product or service.
keywords: A list of important terms and topics for search.

The content is as follows:

Title: ${title}

Article content:

${content}
`.trim()

export const ClassifySchema = z.object({
  scores: z.object({
    surprising: z.number(),
    current_event: z.number(),
    newsworthy: z.number(),
    world_impact: z.number(),
    fluff: z.number(),
    marketing: z.number(),
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

export async function llm(prompt: string) {
  const resp = await callOpenAI(
    (openai) => {
      return openai.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'gpt-4o-mini',
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
