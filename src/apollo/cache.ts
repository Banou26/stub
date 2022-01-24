import { InMemoryCache } from '@apollo/client'

export default new InMemoryCache({
  possibleTypes: {
    Handle: ['TitleHandle', 'EpisodeHandle', 'Image', 'Name', 'ReleaseDate', 'Synopsis', 'Tag', 'Genre']
  }
})
