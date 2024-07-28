import { requireEnv } from './config.ts'
import { PQueue, RunpodSDK, assert, log } from '../../deps.ts'

const RUNPOD_API_KEY = requireEnv('RUNPOD_API_KEY')
const RUNPOD_WHISPER_ENDPOINT = requireEnv('RUNPOD_WHISPER_ENDPOINT')

const runpod = RunpodSDK(RUNPOD_API_KEY)
const endpoint = runpod.endpoint(RUNPOD_WHISPER_ENDPOINT)

const transcribeQueue = new PQueue({
  concurrency: 3,
  interval: 10000,
  intervalCap: 2,
})

export async function transcribeAudio(url: string): Promise<string> {
  const transcription = await transcribeQueue.add(async () => {
    log.info('transcribing audio', { url })
    return await endpoint?.runSync({
      input: { audio: url },
    })
  })
  assert(transcription != null)
  assert(transcription.status === 'COMPLETED', transcription.status)

  return transcription.output.transcription
}
