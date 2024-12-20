import { z } from '../../deps.ts'
import { SQLite, dateFns } from '../../deps.ts'
import {
  Content,
  ContentData,
  ContentFreshQuery,
  ContentId,
  ContentWithChildren,
  SourceData,
  SourceFetchOptions,
  SourceId,
  SourceStatus,
  SourceStore,
} from '../types.ts'
import { ClassifySchema } from './openai.ts'

const truncatePeriod: dateFns.Duration = { days: 7 }

export class Store {
  db: SQLite

  constructor(path: string) {
    this.db = new SQLite(path)
    this._init()

    globalThis.addEventListener('unload', () => this.db.close())
  }

  _init() {
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS content (
        contentId INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        sourceId TEXT NOT NULL,
        sourceURL TEXT,
        url TEXT UNIQUE,
        title TEXT NOT NULL,
        author TEXT,
        contentTimestamp TEXT,
        content TEXT NOT NULL,
        kind TEXT NOT NULL,
        hash TEXT,
        parentContentId INTEGER,
        FOREIGN KEY (parentContentId) REFERENCES content (contentId) ON DELETE CASCADE
      )
    `)

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS source (
        sourceId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        shortName TEXT NOT NULL
      )
    `)

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS summary (
        summaryId INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        contentId INTEGER NOT NULL UNIQUE,
        contentSummary TEXT NOT NULL,
        FOREIGN KEY (contentId) REFERENCES content (contentId) ON DELETE CASCADE
      )
    `)

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS classify (
        classifyId INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        contentId INTEGER NOT NULL UNIQUE,
        classifyResult TEXT NOT NULL,
        FOREIGN KEY (contentId) REFERENCES content (contentId) ON DELETE CASCADE
      )
    `)

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS log (
        logId INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        sourceId TEXT NOT NULL,
        text TEXT NOT NULL
      )
    `)

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS updateLog (
        updateId INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        sourceId TEXT NOT NULL,
        durationMs INTEGER NOT NULL,
        status INTEGER NOT NULL
      )
    `)

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS rotateLog (
        rotateId INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        minContentId INTEGER NOT NULL,
        maxContentId INTEGER NOT NULL,
        minContentTimestamp TEXT NOT NULL,
        maxContentTimestamp TEXT NOT NULL
      )
    `)

    // Timestamp db creation to base first rotation time off.
    this.db.execute(`
      INSERT OR IGNORE INTO rotateLog (rotateId, minContentId, maxContentId, minContentTimestamp, maxContentTimestamp) VALUES (0, 0, 0, 0, 0)
    `)
  }

  close() {
    this.db.close()
  }

  log(sourceId: SourceId | 'system', text: string) {
    this.db.query(
      'INSERT INTO log (sourceId, text) VALUES (:sourceId, :text)',
      {
        sourceId,
        text,
      },
    )
  }

  addContent(sourceId: SourceId, data: ContentData): Content {
    return this.db.queryEntries<Content>(
      `
      INSERT INTO content (sourceId, url, hash, title, author, contentTimestamp, content, kind, sourceURL, parentContentId)
      VALUES (:sourceId, :url, :hash, :title, :author, :contentTimestamp, :content, :kind, :sourceURL, :parentContentId)
      ON CONFLICT(url) DO UPDATE SET title=:title, content=:content, kind=:kind, hash=:hash, timestamp=CURRENT_TIMESTAMP
      RETURNING contentId as id, url, hash, title, author, timestamp, contentTimestamp, content, kind, sourceURL, parentContentId
      `,
      { sourceId, ...data },
    )[0]
  }

  getContentMissingSummary(): Content[] {
    return this.db.queryEntries<Content>(
      'SELECT contentId as id, url, hash, title, author, contentTimestamp, content, sourceId, sourceURL, parentContentId FROM content LEFT JOIN summary USING (contentId) WHERE contentSummary IS NULL',
    )
  }

  getContentWithChildSummaries({
    since,
  }: {
    since?: dateFns.Duration
  } = {}): ContentWithChildren[] {
    const rows = this.db.queryEntries<
      ContentWithChildren & {
        childContent: string
        classifyResult: string | null
      }
    >(
      `SELECT content.contentId as id, content.sourceId, content.url, content.hash, content.title, content.author, content.timestamp as timestamp, content.contentTimestamp, content.content, content.sourceURL, summary.contentSummary, classifyResult, source.shortName as sourceShortName, json_group_array(json_object(
        'id', childContent.contentId,
        'url', childContent.url,
        'title', childContent.title,
        'timestamp', childContent.timestamp,
        'contentTimestamp', childContent.contentTimestamp,
        'sourceId', childContent.sourceId,
        'sourceURL', childContent.sourceURL,
        'contentSummary', childSummary.contentSummary,
        'sourceShortName', source.shortName
      )) FILTER (where childContent.contentId IS NOT NULL) as childContent
      FROM content
      LEFT JOIN source USING (sourceId)
      LEFT JOIN summary USING (contentId)
      LEFT JOIN classify USING (contentId)
      LEFT JOIN content childContent ON childContent.parentContentId = content.contentId
      LEFT JOIN summary childSummary ON childSummary.contentId = childContent.contentId
      WHERE unixepoch(content.timestamp) > unixepoch(:threshold) AND content.parentContentId IS NULL
      GROUP BY content.contentId
      ORDER BY content.timestamp DESC`,
      {
        threshold: since ? dateFns.sub(Date.now(), since) : 0,
      },
    )
    return rows.map((content) => ({
      ...content,
      childContent: JSON.parse(content.childContent),
      classifyResult:
        content.classifyResult != null
          ? JSON.parse(content.classifyResult)
          : null,
    }))
  }

  getSummary(contentId: ContentId): string | null {
    const results = this.db.query<[string]>(
      'SELECT contentSummary FROM summary WHERE contentId=:contentId',
      { contentId },
    )
    return results.length > 0 ? results[0][0] : null
  }

  getClassifyResult(
    contentId: ContentId,
  ): z.infer<typeof ClassifySchema> | null {
    const results = this.db.query<[string]>(
      'SELECT classifyResult FROM classify WHERE contentId=:contentId',
      { contentId },
    )
    return results.length > 0 ? JSON.parse(results[0][0]) : null
  }

  isSourceFresh(
    sourceId: SourceId,
    { deltaSuccess, deltaRetry }: SourceFetchOptions = {
      deltaSuccess: { minutes: 5 },
      deltaRetry: { minutes: 1 },
    },
  ) {
    const results = this.db.query<[number]>(
      `SELECT COUNT(1) FROM updateLog WHERE sourceId=:sourceId AND (
        (status=:statusSuccess AND unixepoch(timestamp) > unixepoch(:thresholdSuccess))
        OR unixepoch(timestamp) > unixepoch(:thresholdRetry)
      )`,
      {
        sourceId,
        statusSuccess: SourceStatus.SUCCESS,
        thresholdSuccess: dateFns.sub(Date.now(), deltaSuccess ?? {}),
        thresholdRetry: dateFns.sub(Date.now(), deltaRetry ?? {}),
      },
    )
    return results.length > 0 && results[0][0] > 0
  }

  getFreshContentId({
    url,
    hash,
    delta = { days: 7 },
  }: ContentFreshQuery): ContentId | null {
    const params: Record<string, string> = {
      threshold: dateFns.sub(Date.now(), delta).toISOString(),
    }
    const predicates = ['unixepoch(timestamp) > unixepoch(:threshold)']

    if (url) {
      predicates.push('url=:url')
      params['url'] = url
    }

    if (hash) {
      predicates.push('hash=:hash')
      params['hash'] = hash
    }

    const results = this.db.queryEntries<{ id: ContentId }>(
      `SELECT contentId as id FROM content WHERE ${predicates.join(' AND ')}`,
      params,
    )
    return results.length > 0 ? results[0].id : null
  }

  addSourceResult(
    sourceId: SourceId | 'system',
    { durationMs, status }: { durationMs: number; status: SourceStatus },
  ) {
    this.db.query(
      'INSERT INTO updateLog (sourceId, durationMs, status) VALUES (:sourceId, :durationMs, :status)',
      { sourceId, durationMs, status },
    )
  }

  addSummary(
    contentId: ContentId,
    { contentSummary }: { contentSummary: string },
  ) {
    this.db.query(
      'INSERT INTO summary (contentId, contentSummary) VALUES (:contentId, :contentSummary) ON CONFLICT(contentId) DO UPDATE SET contentSummary=:contentSummary, timestamp=CURRENT_TIMESTAMP',
      { contentId, contentSummary },
    )
  }

  addClassifyResult(
    contentId: ContentId,
    { classifyResult }: { classifyResult: z.infer<typeof ClassifySchema> },
  ) {
    this.db.query(
      'INSERT INTO classify (contentId, classifyResult) VALUES (:contentId, :classifyResult) ON CONFLICT(contentId) DO UPDATE SET classifyResult=:classifyResult, timestamp=CURRENT_TIMESTAMP',
      { contentId, classifyResult: JSON.stringify(classifyResult) },
    )
  }

  updateSource(sourceId: string, data: SourceData) {
    this.db.query(
      'INSERT INTO source (sourceId, name, shortName) VALUES (:sourceId, :name, :shortName) ON CONFLICT(sourceId) DO UPDATE SET name=:name, shortName=:shortName',
      { sourceId, ...data, shortName: data.shortName ?? data.name },
    )
  }

  withSource(
    sourceId: SourceId,
    { onContent }: { onContent: (data: Content) => Promise<void> | void },
  ): SourceStore {
    return {
      log: (text: string) => this.log(sourceId, text),
      addContent: async (data: ContentData) => {
        const content = this.addContent(sourceId, data)
        await onContent(content)
        return content
      },
      addSummary: this.addSummary.bind(this),
      updateSource: (data: SourceData) => this.updateSource(sourceId, data),
      getFreshContentId: this.getFreshContentId.bind(this),
    }
  }

  shouldRotate(period: dateFns.Duration = truncatePeriod): boolean {
    return (
      this.db.query<[number]>(
        `SELECT COUNT(1) FROM rotateLog WHERE unixepoch(timestamp) > unixepoch(:threshold)`,
        {
          threshold: dateFns.sub(Date.now(), period),
        },
      )[0][0] === 0
    )
  }

  logRotate(): number {
    return this.db.queryEntries<{ rotateId: number }>(`
      INSERT INTO rotateLog (minContentId, maxContentId, minContentTimestamp, maxContentTimestamp)
      SELECT MIN(contentId) as minContentId, MAX(contentId) as maxContentId, MIN(timestamp) as minContentTimestamp, MAX(timestamp) as maxContentTimestamp
      FROM content
      RETURNING rotateId
    `)[0].rotateId
  }

  truncate(period: dateFns.Duration = truncatePeriod) {
    // FIXME: DELETEs are really slow with foreign key checking on. Perhaps it'll be faster with ON DELETE CASCADE?
    this.db.execute('PRAGMA foreign_keys = OFF')
    this.db.transaction(() => {
      const threshold = dateFns.sub(Date.now(), period)
      this.db.query(
        `DELETE FROM content WHERE unixepoch(timestamp) < unixepoch(:threshold)`,
        { threshold },
      )
      this.db.query(
        `DELETE FROM summary WHERE unixepoch(timestamp) < unixepoch(:threshold)`,
        { threshold },
      )
      this.db.query(
        `DELETE FROM classify WHERE unixepoch(timestamp) < unixepoch(:threshold)`,
        { threshold },
      )
      this.db.query(
        `DELETE FROM log WHERE unixepoch(timestamp) < unixepoch(:threshold)`,
        { threshold },
      )
      this.db.query(
        `DELETE FROM updateLog WHERE unixepoch(timestamp) < unixepoch(:threshold)`,
        { threshold },
      )
    })
    this.db.execute('PRAGMA foreign_keys = ON')
  }
}
