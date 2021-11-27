import { ApolloClient } from '@apollo/client'

import cache from './cache'

const client = new ApolloClient({ cache })

export default client
