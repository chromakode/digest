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
    disturbing,
    category,
  } = classifyResult?.scores ?? {}
  const pos = [surprising, current_event, newsworthy, world_impact]
  const neg = [fluff, marketing]
  const bait = [ragebait, clickbait]
  return (
    pos.some((s) => s >= 4) &&
    !neg.some((s) => s >= 3) &&
    !bait.some((s) => s >= 3.5) &&
    !(disturbing > 3 && world_impact < 3) &&
    !(category === 'sports' && world_impact <= 3)
  )
}
