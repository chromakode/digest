import { navigate } from 'astro:transitions/client'
import { addMinutes } from 'date-fns'

const REFRESH_INTERVAL_MIN = 15

document.addEventListener('visibilitychange', () => {
  const now = Date.now()
  const lastUpdateTime =
    document.querySelector<HTMLTimeElement>('.updated time')?.dateTime

  if (
    document.visibilityState === 'visible' &&
    lastUpdateTime != null &&
    now > addMinutes(lastUpdateTime, REFRESH_INTERVAL_MIN).getTime()
  ) {
    navigate('')
  }
})
