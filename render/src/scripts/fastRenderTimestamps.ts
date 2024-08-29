import { formatDistanceStrict } from 'date-fns'

const now = Date.now()

for (const timeEl of document.querySelectorAll('time')) {
  timeEl.innerText = formatDistanceStrict(timeEl.dateTime, now, {
    addSuffix: true,
  })
}
