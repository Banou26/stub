import { InMemoryCache } from '@apollo/client'

export default new InMemoryCache({
  typePolicies: {
    Handle: {
      keyFields: ['uri']
    }
  },
  possibleTypes: {
    Handle: ['Title', 'Episode', 'TitleHandle', 'EpisodeHandle', 'Image', 'Name', 'ReleaseDate', 'Synopsis', 'Tag', 'Genre']
  }
})
