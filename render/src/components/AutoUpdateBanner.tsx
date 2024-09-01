import { navigate } from 'astro:transitions/client'
import { addMinutes } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'

const REFRESH_INTERVAL_MIN = 15

export default function AutoUpdateBanner() {
  const [canUpdate, setCanUpdate] = useState(false)
  const [isUpdating, setUpdating] = useState(false)

  useEffect(() => {
    function checkCanUpdate() {
      const now = Date.now()
      const lastUpdateTime =
        document.querySelector<HTMLTimeElement>('.updated time')?.dateTime

      if (
        document.visibilityState === 'visible' &&
        lastUpdateTime != null &&
        now > addMinutes(lastUpdateTime, REFRESH_INTERVAL_MIN).getTime()
      ) {
        if (window.scrollY <= 100) {
          setUpdating(true)
          navigate('')
        } else {
          setCanUpdate(true)
        }
      }
    }

    document.addEventListener('visibilitychange', checkCanUpdate)

    return () => {
      document.removeEventListener('visibilitychange', checkCanUpdate)
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
