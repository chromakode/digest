import { loadConfig } from '../../deps.ts'

export function requireEnv(name: string) {
  const val = Deno.env.get(name)

  if (!val) {
    console.error(`${name} required.`)
    Deno.exit(1)
  }

  return val
}

export async function initConfig() {
  await loadConfig({ export: true })
}
