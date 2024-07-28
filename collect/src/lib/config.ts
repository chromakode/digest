import { loadConfig } from '../../deps.ts'

export function requireEnv(name: string) {
  const val = Deno.env.get(name)

  if (!val) {
    console.error(`${name} required.`)
    Deno.exit(1)
  }

  return val
}

await loadConfig({ export: true })
