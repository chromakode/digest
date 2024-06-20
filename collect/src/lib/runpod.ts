import { RUNPOD_API_KEY, RUNPOD_WHISPER_ENDPOINT } from './config.ts'
import { PQueue, RunpodSDK, assert, log } from '../../deps.ts'

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
