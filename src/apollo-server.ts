import { ApolloServer } from '@apollo/server'
import { ApolloClient, InMemoryCache, HttpLink, gql } from '@apollo/client'

const typeDefs = `#graphql
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
  console.log('input', input)
  console.log('init', init)
  const headers = new Map<string, string>();
  for (const [key, value] of Object.entries(init.headers!)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  const httpGraphQLRequest = {
    body: JSON.parse(init.body!),
    headers,
    method: init.method!,
    search: ''
  }
  console.log('httpGraphQLRequest', httpGraphQLRequest)
  const deferRes = await server.executeOperation(JSON.parse(init.body!))
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