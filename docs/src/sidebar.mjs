// The reading order, and the only place it is declared. Starlight's prev/next walks this, so the
// sequence is the argument the site makes: what a thing is, then how it is asked, then what it is
// allowed to claim, then how the claims are merged, then what comes back out.
export const sidebar = [
  { label: 'Start here', items: [{ label: 'The whole flow', slug: 'index' }] },
]
