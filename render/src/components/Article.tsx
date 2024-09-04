import Markdown from 'react-markdown'
import Timestamp from './Timestamp'
import rehypeSanitize from 'rehype-sanitize'
import rehypeExternalLinks from 'rehype-external-links'
import { parseISO } from 'date-fns'
import type { PluggableList } from 'node_modules/react-markdown/lib'
import type { SearchResult } from 'minisearch'

export interface Content {
  id: string
  title: string
  timestamp: string
  contentTimestamp: string
  contentSummary: string
  classifyResult?: Record<string, any>
  url: string
  sourceId: string
  sourceShortName: string
  sourceURL: string
}

export type ContentWithChildren = Content & { childContent?: Content[] }

export type SearchResultContent = SearchResult & ContentWithChildren

const rehypePlugins: PluggableList = [
  rehypeSanitize,
  [rehypeExternalLinks, { rel: ['nofollow'] }],
]

function Info({
  title,
  sourceShortName,
  sourceURL,
  contentTimestamp,
}: Pick<
  ContentWithChildren,
  'title' | 'sourceShortName' | 'sourceURL' | 'contentTimestamp'
>) {
  return (
    <div className="info">
      <a className="source" href={sourceURL} title={sourceShortName}>
        {sourceShortName} {title}
      </a>
      <Timestamp dateTime={parseISO(contentTimestamp + 'Z')} />
    </div>
  )
}

function ClassifyInfo({
  classifyResult,
}: {
  classifyResult: Record<string, any> | undefined
}) {
  if (!classifyResult) {
    return
  }

  const { scores }: { scores?: Record<string, number> } = classifyResult

  return (
    <div className="info classify">
      {Object.entries(scores ?? {}).map(([key, score]) => (
        <span>
          {key}: {score}
        </span>
      ))}
    </div>
  )
}

export function DigestArticle({
  id,
  contentSummary,
  nextDigestId,
}: ContentWithChildren & { nextDigestId: string | undefined }) {
  const nextDigestLink =
    nextDigestId != null ? ` [&raquo;](#content-${nextDigestId})` : ''
  return (
    <article id={`content-${id}`} className="digest">
      <div className="content">
        <Markdown className="summary" rehypePlugins={rehypePlugins}>
          {contentSummary + nextDigestLink}
        </Markdown>
      </div>
    </article>
  )
}

export default function Article(
  props: ContentWithChildren & { showClassifyInfo?: boolean },
) {
  const {
    id,
    title,
    contentSummary,
    classifyResult,
    url: urlStr,
    childContent = [],
    showClassifyInfo,
  } = props

  const url = new URL(urlStr)
  const showDomain = ![props, ...childContent].some(
    (c) => c.sourceId.startsWith('podcast:') || c.sourceURL === urlStr,
  )
  const domain = url.host.replace(/^www\./, '')

  const shouldRewordTitle =
    classifyResult?.scores?.vague_title >= 3 ||
    classifyResult?.scores?.clickbait >= 3
  const rewordedTitle = classifyResult?.title

  return (
    <article id={`content-${id}`}>
      <div className="content">
        <h2>
          <a href={urlStr} rel="nofollow">
            {shouldRewordTitle ? `${rewordedTitle} (retitled)` : title}
          </a>
          {showDomain && (
            <a className="domain" href={url.origin} rel="nofollow">
              {domain}
            </a>
          )}
        </h2>
        <Markdown className="summary" rehypePlugins={rehypePlugins}>
          {contentSummary ?? ''}
        </Markdown>
      </div>
      <div className="children">
        {childContent?.length ? (
          childContent.map((child: Content) => (
            <div className="child" key={child.id}>
              <Info {...child} />
              <Markdown className="summary" rehypePlugins={rehypePlugins}>
                {child.contentSummary ?? ''}
              </Markdown>
            </div>
          ))
        ) : (
          <Info {...props} title="" />
        )}
      </div>
      {showClassifyInfo && classifyResult && (
        <ClassifyInfo classifyResult={classifyResult} />
      )}
    </article>
  )
}
