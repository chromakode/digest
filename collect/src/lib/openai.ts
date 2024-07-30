import { OpenAI, PQueue, PRetry, assert, delay, log } from '../../deps.ts'
import { requireEnv } from './config.ts'

const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY')

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const summarizeQueue = new PQueue({
  concurrency: 10,
  interval: 5000,
  intervalCap: 10,
})

export const summarizePrompt = (title: string, content: string) => `
Summarize the following content in a single sentence using 16 words or less. If the summary is similar to the title, omit the summary sentence. Also, extract 3 key bulleted points. Use active tense. Use markdown, but do not use bold or italic.

Article title: ${title}

Article content:

${content}
`

export const summarizeChildPrompt = (
  title: string,
  summary: string,
  content: string,
) => `
Summarize the following discussion in 2 bulleted points. Use active tense. Use markdown, but do not use bold or italic. Do not repeat information from the title or summary.

Title: ${title}

Summary:

${summary}

Discussion:

${content}
`

export async function summarize(content: string) {
  const result = await PRetry(
    () =>
      summarizeQueue.add(async () => {
        log.info('fetching summary', { length: content.length })
        try {
          return await openai.chat.completions.create({
            messages: [
              {
                role: 'user',
                content,
              },
            ],
            model: 'gpt-4o-mini',
          })
        } catch (err) {
          if (err.code === 'rate_limit_exceeded' && !summarizeQueue.isPaused) {
            const retryAfterMs = Number(err.headers['retry-after-ms'])
            log.info(`waiting ${retryAfterMs}ms for OpenAI ratelimit`)
            summarizeQueue.pause()
            await delay(retryAfterMs)
            summarizeQueue.start()
          }
          throw err
        }
      }),
    { retries: 5 },
  )

  assert(result != null)

  const summary = result.choices[0].message.content
  assert(summary != null)

  return summary
}
