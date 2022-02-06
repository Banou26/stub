export const fromUri = (uri: string) => {
  const [scheme, id] = uri.split(':')
  return { scheme, id }
}

export const toUri = ({ scheme, id }: { scheme: string, id: string }) => `${scheme}:${id}`
