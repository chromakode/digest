import { loadConfig } from '../../deps.ts'

function requireEnv(name: string) {
  const val = Deno.env.get(name)

  if (!val) {
    console.error(`${name} required.`)
    Deno.exit(1)
  }

  return val
}

await loadConfig({ export: true })

export const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY')
export const RUNPOD_API_KEY = requireEnv('RUNPOD_API_KEY')
export const RUNPOD_WHISPER_ENDPOINT = requireEnv('RUNPOD_WHISPER_ENDPOINT')
export const OUTPUT_DIR = Deno.env.get('OUTPUT_DIR') ?? './output'
export const SITE_BUILD_HOOK = Deno.env.get('SITE_BUILD_HOOK')
