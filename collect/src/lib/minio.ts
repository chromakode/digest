import { Minio, log, path } from '../../deps.ts'
import { requireEnv } from './config.ts'
import { fromNodeStream, toNodeStream } from './utils.ts'

export function initMinio() {
  const endpoint = requireEnv('MINIO_ENDPOINT')

  const minioURL = new URL(endpoint)
  const minioBucket = minioURL.pathname.substring(1)

  const minioClient = new Minio.Client({
    endPoint: minioURL.hostname,
    port: minioURL.port ? Number(minioURL.port) : undefined,
    accessKey: decodeURIComponent(minioURL.username),
    secretKey: decodeURIComponent(minioURL.password),
    region: minioURL.searchParams.get('region') ?? '',
    useSSL: minioURL.protocol === 'https:',
  })

  async function fetchDB(destPath: string) {
    const dbFile = await Deno.open(destPath, {
      write: true,
      create: true,
    })

    try {
      await fromNodeStream(
        await minioClient.getObject(minioBucket, 'digest.db'),
      ).pipeTo(dbFile.writable)
    } catch (err) {
      log.error('error fetching digest.db', err)
    }

    log.info('fetched digest.db from minio')
  }

  async function uploadDB(outputDir: string) {
    const digestData = (
      await Deno.open(path.join(outputDir, 'digest.db'))
    ).readable.pipeThrough(new CompressionStream('gzip'))

    await minioClient.putObject(
      minioBucket,
      'digest.db',
      toNodeStream(digestData),
      undefined,
      { 'Content-Type': 'application/x-sqlite3', 'Content-Encoding': 'gzip' },
    )

    log.info('uploaded digest.db to minio')
  }

  return { fetchDB, uploadDB }
}
