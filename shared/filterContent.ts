export function filterContent(classifyResult: Record<string, any> | undefined) {
  const {
    surprising,
    current_event,
    newsworthy,
    world_impact,
    fluff,
    marketing,
  } = classifyResult?.scores ?? {}
  const pos = [surprising, current_event, newsworthy, world_impact]
  const neg = [fluff, marketing]
  return pos.some((s) => s >= 4) && !neg.some((s) => s >= 3)
}
