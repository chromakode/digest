import {
  formatDistanceStrict,
  intlFormat,
  type IntlFormatFormatOptions,
} from 'date-fns'
import { useEffect, useState, type HTMLAttributes } from 'react'
import { useInView } from 'react-intersection-observer'

export interface Props
  extends Omit<HTMLAttributes<HTMLTimeElement>, 'dateTime'> {
  dateTime: Date
  baseTime?: Date
}

const dateFormat: IntlFormatFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
}

export default function Timestamp({ dateTime }: Props) {
  const { ref, inView } = useInView()

  const [baseTime, setBaseTime] = useState<Date | null>(null)
  const [title, setTitle] = useState<string | undefined>()

  useEffect(() => {
    if (!inView) {
      return
    }

    let timeout: number | undefined
    function update() {
      const now = Date.now()
      setBaseTime(new Date())
      setTitle(intlFormat(dateTime, dateFormat))

      const wait = Math.max(
        1000,
        60 * 1000 - ((now - dateTime.getTime()) % (60 * 1000)),
      )
      timeout = setTimeout(update, wait)
    }
    update()

    return () => {
      clearTimeout(timeout)
    }
  }, [inView])

  if (isNaN(dateTime.valueOf())) {
    return null
  }

  return (
    <time ref={ref} dateTime={dateTime.toISOString()} title={title}>
      {baseTime &&
        formatDistanceStrict(dateTime, baseTime, { addSuffix: true })}
    </time>
  )
}
