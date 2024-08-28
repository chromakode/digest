import Markdown from 'react-markdown'
import Timestamp from './Timestamp'
import rehypeSanitize from 'rehype-sanitize'
import { parseISO } from 'date-fns'

export interface Content {
  id: string
  title: string
  contentTimestamp: string
  contentSummary: string
  url: string
  sourceId: string
  sourceShortName: string
  sourceURL: string
}

export type ContentWithChildren = Content & { childContent: Content[] }

const iconMap = new Map([
  ['hn', 'hn.svg'],
  ['tildes', 'tildes.png'],
])

function Info({
  title,
  sourceId,
  sourceShortName,
  sourceURL,
  contentTimestamp,
}: Pick<
  ContentWithChildren,
  'title' | 'sourceShortName' | 'sourceId' | 'sourceURL' | 'contentTimestamp'
>) {
  const iconName = iconMap.get(sourceId)
  return (
    <div className="info">
      {iconName && <img className="icon" src={`/icon/${iconName}`} />}
      <a className="source" href={sourceURL} title={sourceShortName}>
        {sourceShortName} {title}
      </a>
      <Timestamp dateTime={parseISO(contentTimestamp + 'Z')} />
    </div>
  )
}

export default function Article(content: ContentWithChildren) {
  const {
    id,
    title,
    sourceId,
    contentSummary,
    url: urlStr,
    childContent,
  } = content

  const url = new URL(urlStr)
  const showDomain = ![content, ...childContent].some(
    (c) => c.sourceId.startsWith('podcast:') || c.sourceURL === urlStr,
  )
  const domain = url.host.replace(/^www\./, '')

  if (sourceId === 'digest') {
    return (
      <article id={`content-${id}`}>
        <div className="content">
          <Markdown className="summary" rehypePlugins={[rehypeSanitize]}>
            {contentSummary}
          </Markdown>
        </div>
      </article>
    )
  }

  return (
    <article id={`content-${id}`}>
      <div className="content">
        <h2>
          <a href={urlStr}>{title}</a>
          {showDomain && (
            <a className="domain" href={url.origin}>
              {domain}
            </a>
          )}
        </h2>
        <Markdown className="summary" rehypePlugins={[rehypeSanitize]}>
          {contentSummary ?? ''}
        </Markdown>
      </div>
      <div className="children">
        {childContent?.length ? (
          childContent.map((child: Content) => (
            <div className="child" key={child.id}>
              <Info {...child} />
              <Markdown className="summary" rehypePlugins={[rehypeSanitize]}>
                {child.contentSummary ?? ''}
              </Markdown>
            </div>
          ))
        ) : (
          <Info {...content} title="" />
        )}
      </div>
    </article>
  )
}
