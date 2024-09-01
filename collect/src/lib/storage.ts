import { z } from '../../deps.ts'
import { SQLite, dateFns } from '../../deps.ts'
import {
  Content,
  ContentData,
  ContentFreshQuery,
  ContentId,
  ContentWithChildren,
  ContentWithSummary,
  SourceData,
  SourceFetchOptions,
  SourceId,
  SourceStatus,
  SourceStore,
} from '../types.ts'
import { ClassifySchema } from './openai.ts'

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
        hash TEXT,
        parentContentId INTEGER,
        FOREIGN KEY (parentContentId) REFERENCES content (contentId)
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
        FOREIGN KEY (contentId) REFERENCES content (contentId)
      )
    `)

    this.db.execute(`
      CREATE TABLE IF NOT EXISTS classify (
        classifyId INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        contentId INTEGER NOT NULL UNIQUE,
        classifyResult TEXT NOT NULL,
        FOREIGN KEY (contentId) REFERENCES content (contentId)
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
      INSERT INTO content (sourceId, url, hash, title, author, contentTimestamp, content, sourceURL, parentContentId)
      VALUES (:sourceId, :url, :hash, :title, :author, :contentTimestamp, :content, :sourceURL, :parentContentId)
      ON CONFLICT(url) DO UPDATE SET title=:title, content=:content, hash=:hash, timestamp=CURRENT_TIMESTAMP
      RETURNING contentId as id, url, hash, title, author, timestamp, contentTimestamp, content, sourceURL, parentContentId
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
    const rows = this.db.queryEntries<ContentWithSummary>(
      'SELECT contentId as id, sourceId, url, hash, title, author, content.timestamp as timestamp, contentTimestamp, content, sourceURL, contentSummary, shortName as sourceShortName FROM content LEFT JOIN source USING (sourceId) LEFT JOIN summary USING (contentId) WHERE unixepoch(content.timestamp) > unixepoch(:threshold) AND parentContentId IS NULL ORDER BY content.timestamp DESC',
      {
        threshold: since ? dateFns.sub(Date.now(), since) : 0,
      },
    )
    return rows.map((content) => {
      const childContent = this.db.queryEntries<ContentWithSummary>(
        'SELECT contentId as id, url, title, content.timestamp as timestamp, contentTimestamp, sourceId, sourceURL,contentSummary, shortName as sourceShortName FROM content LEFT JOIN source USING (sourceId) LEFT JOIN summary using (contentId) WHERE parentContentId = :parentContentId',
        { parentContentId: content.id },
      )
      return { ...content, childContent }
    })
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
    delta = { days: 3 },
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
    { onContent }: { onContent: (data: Content) => Promise<void> },
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
}
