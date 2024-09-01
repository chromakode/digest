export function filterContent(classifyResult: Record<string, any> | undefined) {
  const {
    surprising,
    current_event,
    newsworthy,
    world_impact,
    fluff,
    marketing,
    ragebait,
    clickbait,
    category,
  } = classifyResult?.scores ?? {}
  const pos = [surprising, current_event, newsworthy, world_impact]
  const neg = [fluff, marketing]
  const bait = [ragebait, clickbait]
  return (
    pos.some((s) => s >= 4) &&
    !neg.some((s) => s >= 3) &&
    !bait.some((s) => s >= 3.5) &&
    !(category === 'sports' && world_impact < 3)
  )
}
