import { dateFns } from '../../deps.ts'
import * as NodeStream from 'node:stream'
import * as NodeStreamWeb from 'node:stream/web'

export function tryDate(text: string | null | undefined): string | undefined {
  if (!text) {
    return
  }

  try {
    return dateFns.parseISO(text).toISOString()
  } catch (_err) {
    return
  }
}

export function relativeURL(url: string | null | undefined, baseURL: string) {
  if (!url) {
    return
  }

  return new URL(url, baseURL).toString()
}

export function fromNodeStream(stream: NodeStream.Readable) {
  return NodeStream.Readable.toWeb(stream) as ReadableStream
}

export function toNodeStream(stream: ReadableStream) {
  return NodeStream.Readable.fromWeb(stream as NodeStreamWeb.ReadableStream)
}
