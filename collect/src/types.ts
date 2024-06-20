import { RowObject, dateFns } from '../deps.ts'

export type SourceId = string & { __brand: 'SourceId' }
export type ContentId = string & { __brand: 'ContentId' }

export enum SourceStatus {
  ERROR,
  SUCCESS,
}

export interface ContentData {
  url: string
  hash?: string
  title: string
  author?: string
  contentTimestamp?: string
  content: string
  sourceURL?: string
  parentContentId?: ContentId
}

export interface Content extends ContentData, RowObject {
  id: ContentId
  sourceId: SourceId
}

export interface ContentWithSummary extends Content {
  sourceShortName: string
  contentSummary: string
}

export interface ContentWithChildren extends ContentWithSummary {
  childContent: ContentWithSummary[]
}

export interface SourceData {
  name: string
  shortName?: string
}

export interface SourceFetchOptions {
  deltaSuccess?: dateFns.Duration
  deltaRetry?: dateFns.Duration
}

export abstract class Source {
  abstract id: SourceId
  abstract fetch(store: SourceStore): Promise<SourceStatus>
}

export interface ContentFreshQuery {
  url?: string
  hash?: string
  delta?: dateFns.Duration
}

export interface SourceStore {
  log(text: string): void
  addContent(data: ContentData): Promise<Content>
  updateSource(data: SourceData): void
  isContentFresh(opts: ContentFreshQuery): boolean
}
