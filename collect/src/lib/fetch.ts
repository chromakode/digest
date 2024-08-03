export function fetchWithUA(url: string | URL, init?: RequestInit) {
  return globalThis.fetch(
    url,
    init === undefined
      ? undefined
      : {
          ...init,
          headers: {
            'User-Agent': 'MaxDigest/0.1 (digest.chromakode.com)',
            ...init?.headers,
          },
        },
  )
}
