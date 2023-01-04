import { ApolloServer } from '@apollo/server'
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'
import gql from 'graphql-tag'

const typeDefs = `#graphql
  directive @defer(if: Boolean, label: String) on FRAGMENT_SPREAD | INLINE_FRAGMENT
  directive @stream(if: Boolean, label: String, initialCount: Int = 0) on FIELD


  # Comments in GraphQL strings (such as this one) start with the hash (#) symbol.

  type Test {
    foo: String
  }

  # This "Book" type defines the queryable fields for every book in our data source.
  type Book {
    title: String
    author: String
    test: Test
  }

  # The "Query" type is special: it lists all of the available queries that
  # clients can execute, along with the return type for each. In this
  # case, the "books" query returns an array of zero or more Books (defined above).
  type Query {
    books: [Book]
  }
`

const books = [
  {
    title: 'The Awakening',
    author: 'Kate Chopin',
    test: {}
  },
  {
    title: 'City of Glass',
    author: 'Paul Auster',
    test: {}
  },
];

const wait = (time: number) =>
  new Promise((resolve) => setTimeout(resolve, time))

const resolvers = {
  Query: {
    books: () => books,
    // books: async function*() {
    //   for await (const book of books) {
    //     yield book
    //   }
    // }
  },
  Test: {
    foo: async () => {
      await wait(1000)
      return 'bar'
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers
})

server.start().then(() => {
  console.log('server started')
})


// server.executeOperation({
//   query: `query GetBooks {
//     books {
//       title
//       author
//     }
//   }`
// }).then(res => {
//   console.log('YESSSSSSSSSSSSS', res)
// })


const apolloCache = new InMemoryCache();

const fetch: (input: RequestInfo | URL, init: RequestInit) => Promise<Response> = async (input, init) => {
  const body = JSON.parse(init.body!)
  // console.log('input', input)
  // console.log('init', init)
  const headers = new Map<string, string>();
  for (const [key, value] of Object.entries(init.headers!)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  // headers.set('accept', 'application/graphql-response+json')
  // headers.set('accept', 'multipart/mixed; deferSpec=20220824')
  const httpGraphQLRequest = {
    body: JSON.parse(init.body!),
    headers,
    method: init.method!,
    search: ''
  }
  console.log('httpGraphQLRequest', httpGraphQLRequest)
  const req: Parameters<typeof server['executeOperation']>[0] = {
    query: body.query,
    variables: body.variables,
    operationName: body.operationName,
    http: httpGraphQLRequest
  }
  console.log('req', req)
  const deferRes = await server.executeOperation(req)
  // const deferRes = await server.executeOperation(JSON.parse(init.body!))
  console.log('executeOperation', deferRes)
  const deferBody = deferRes.body
  // const deferArr = deferBody.kind === 'single' ? [await deferBody.singleResult.next(), await deferBody.singleResult.next(), await deferBody.singleResult.next(), , await deferBody.singleResult.next()] : []
  // console.log('BBBBBBBBBBBBB', deferArr)
  const res = await server.executeHTTPGraphQLRequest({
    httpGraphQLRequest,
    context: async () => ({ req: {}, res: {} })
  })
  console.log('server res', res)
  return new Response(res.body.string, { headers: res.headers, status: res.status})
  // const server = new ApolloServer({
  //   typeDefs,
  //   resolvers,
  //   cache: apolloCache,
  //   context: () => ({ ...init, input })
  // });

  // return server.executeOperation({
  //   query: input,
  //   variables: init?.body
  // }).then(res => {
  //   return new Response(JSON.stringify(res));
  // });
}

const client = new ApolloClient({
  cache: apolloCache,
  // link: new HttpLink({ uri: 'http://localhost:4000/graphql' })
  link: new HttpLink({ fetch })
})

client.query({
  query: gql(`
  
  # fragment TestFragment on Test {
  #   foo
  # }

  query GetBooks {
    books {
      title
      author
      ... @defer {
        test {
          foo
        }
      }
      # test {
      #   ...TestFragment @defer
      # }
      # test {
      #   foo
      # }
    }
  }
  
  `)
}).then(res => {
  console.log('client res', res)
})