import { navigate } from 'astro:transitions/client'
import { isAfter } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'

const REFRESH_INTERVAL_MIN = 15

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
