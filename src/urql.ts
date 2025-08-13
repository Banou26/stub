import { Client } from 'urql'

const client = new Client({
  exchanges: [],
  url: 'http://localhost:3000/graphql'
})

export default client
