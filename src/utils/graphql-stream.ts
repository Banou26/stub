// Put one document through the worker the way the app's own client does, and read the stream it
// answers with.
//
// Every read in this app is a SUBSCRIPTION, so a document does not answer once: it yields again each
// time the store moves, and the first payload of a cold page is routinely an empty list a later one
// fills. So a caller gets every payload as it arrives plus the last one at the end, and decides for
// itself which of those it wanted.
//
// The request function is a PARAMETER rather than an import. `src/worker.ts` spawns a Worker and
// awaits an osra handshake at module scope, so a module that imported `handleRequest` could not be
// loaded in a test at all, and this is the one piece of the two callers (`src/answers-export.ts`'s
// probe and the trace page's warm) that is worth having exactly once.

/** What the worker's own `handleRequest` looks like from here: the osra proxy of yoga's fetch. */
export type GraphQLRequest = (input: string, init: RequestInit) => Promise<Response>

export type StreamOptions = {
  /** How long to keep reading before answering with what arrived. */
  settleMs?: number
  /** Called once per payload, with the payload and how many have arrived including it. */
  onPayload?: (payload: unknown, count: number) => void
  /** Answers true to stop reading early, asked after each payload. */
  done?: (payload: unknown, count: number) => boolean
}

/**
 * Run one GraphQL document through `request` and collect what it streams.
 *
 * Answers the number of payloads and the LAST one. A document the worker answers as plain JSON
 * (an error before the stream opens, typically) comes back as one payload.
 */
export const streamGraphQL = async (
  request: GraphQLRequest,
  query: string,
  variables: Record<string, unknown> = {},
  options: StreamOptions = {},
): Promise<{ payloads: number, last: unknown }> => {
  const settleMs = options.settleMs ?? 20_000
  const response = await request('http://d/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ query, variables }),
  })
  if (!(response.headers.get('content-type') ?? '').includes('event-stream')) {
    const last = await response.json() as unknown
    options.onPayload?.(last, 1)
    return { payloads: 1, last }
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const deadline = Date.now() + settleMs
  let buffer = ''
  let payloads = 0
  let last: unknown
  let stop = false
  while (!stop && Date.now() < deadline) {
    const step = await Promise.race([
      reader.read(),
      new Promise<{ done: true, value: undefined }>(resolve =>
        setTimeout(() => resolve({ done: true, value: undefined }), Math.max(0, deadline - Date.now()))),
    ])
    if (step.done) break
    buffer += decoder.decode(step.value, { stream: true })
    // one SSE event per blank line, and only the `data:` lines carry the payload
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('')
      if (!data) continue
      try {
        last = JSON.parse(data) as unknown
        payloads += 1
      } catch {
        continue
      }
      options.onPayload?.(last, payloads)
      if (options.done?.(last, payloads)) {
        stop = true
        break
      }
    }
  }
  void reader.cancel().catch(() => {})
  return { payloads, last }
}
