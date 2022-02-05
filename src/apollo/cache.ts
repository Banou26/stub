import { InMemoryCache } from '@apollo/client'

export default new InMemoryCache({
  possibleTypes: {
    Handle: ['Title', 'Episode', 'TitleHandle', 'EpisodeHandle', 'Image', 'Name', 'ReleaseDate', 'Synopsis', 'Tag', 'Genre']
  }
})
