export function filterContent(
  sourceId: string,
  classifyResult: Record<string, any> | undefined,
) {
  if (sourceId === 'digest') {
    return true
  }

  const {
    surprising,
    current_event,
    newsworthy,
    world_impact,
    fluff,
    marketing,
    ragebait,
    clickbait,
    disturbing,
    category,
  } = classifyResult?.scores ?? {}
  const pos = [surprising, current_event, newsworthy, world_impact]
  const neg = [fluff, marketing]
  const bait = [ragebait, clickbait]

  if (neg.some((s) => s >= 3) || (disturbing > 3 && world_impact < 3)) {
    return false
  }

  // Treat aggregators as having positive validation. In the future, could classify source types rather than matching by specific id, or let sources set custom filter.
  if (sourceId === 'hn' || sourceId === 'tildes') {
    return true
  }

  return (
    bait.some((s) => s >= 3.5) ||
    (pos.some((s) => s >= 4) && !(category === 'sports' && world_impact <= 3))
  )
}
