import { navigate } from 'astro:transitions/client'
import { isAfter, secondsToMilliseconds } from 'date-fns'
import { throttle } from 'lodash-es'
import { useCallback, useEffect, useState } from 'react'

const checkIntervalSeconds = 60

export default function AutoUpdateBanner() {
  const [canUpdate, setCanUpdate] = useState(false)
  const [isUpdating, setUpdating] = useState(false)

  useEffect(() => {
    function checkCanUpdate() {
      async function check() {
        const now = Date.now()
        const resp = await fetch('/update.json')
        const updateData = await resp.json()
        const lastUpdateTime = updateData.lastUpdate

        const updateAvailable =
          document.visibilityState === 'visible' &&
          lastUpdateTime != null &&
          isAfter(lastUpdateTime, now)

        setCanUpdate(updateAvailable)
        if (updateAvailable && window.scrollY <= 100) {
          setUpdating(true)
          navigate('')
        }
      }
      check()
    }

    const throttledCheck = throttle(checkCanUpdate, secondsToMilliseconds(5))

    const interval = setInterval(
      throttledCheck,
      secondsToMilliseconds(checkIntervalSeconds),
    )
    document.addEventListener('visibilitychange', throttledCheck)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', throttledCheck)
    }
  }, [])

  const handleClick = useCallback(() => {
    setUpdating(true)
  }, [])

  return canUpdate || isUpdating ? (
    <a href="/" className="update-banner" onClick={handleClick}>
      {isUpdating ? 'Updating...' : 'Show new stories'}
    </a>
  ) : null
}
