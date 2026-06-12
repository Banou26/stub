import { cloud } from '@fkn/lib'

export const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  cloud.fetch(input, init)
