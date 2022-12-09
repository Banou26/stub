export type {};
declare const globalThis: ServiceWorkerGlobalScope;

globalThis.addEventListener('fetch', event => {
  if (event.request.url === 'http://localhost:4560/sandbox.html') {
    return (
      event.respondWith(
        fetch(event.request)
          .then((response) => {
              const newHeaders = new Headers(response.headers)
              newHeaders.set("Cross-Origin-Embedder-Policy", 'require-corp')
              newHeaders.set("Cross-Origin-Opener-Policy", "same-origin")
              return new Response(response.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: newHeaders
              })
          })
      )
    )
  }
})
