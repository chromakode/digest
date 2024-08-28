import { Minio, log, path } from '../../deps.ts'
import { fromNodeStream } from './utils.ts'

export function initMinio() {
  const endpoint = Deno.env.get('MINIO_ENDPOINT')

  if (endpoint == null) {
    return {
      fetchDB() {
        log.warn('MINIO_ENDPOINT unset: skipping DB fetch')
      },
      uploadDB() {
        log.warn('MINIO_ENDPOINT unset: skipping DB upload')
      },
    }
  }

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
    log.info('uploading digest.db to minio')

    const gzPath = path.join(outputDir, 'digest.db.gz')
    const gzFile = await Deno.open(gzPath, {
      write: true,
      create: true,
    })

    const inFile = await Deno.open(path.join(outputDir, 'digest.db'))
    await inFile.readable
      .pipeThrough(new CompressionStream('gzip'))
      .pipeTo(gzFile.writable)

    await minioClient.fPutObject(minioBucket, 'digest.db', gzPath, {
      'Content-Type': 'application/x-sqlite3',
      'Content-Encoding': 'gzip',
    })

    log.info('uploaded digest.db to minio')
  }

  return { fetchDB, uploadDB }
}
