import { useSubscription } from 'urql'

import { gql } from '../../generated/gql'
import { MediaStatus } from '../../generated/graphql'

const getReleasingMediaPage = gql(`
  subscription GET_RELEASING_MEDIA_PAGE($input: MediaPageInput!) {
    mediaPage(input: $input) {
      nodes {
        uri
        titles {
          language
          title
        }
        descriptions {
          language
          description
        }
        shortDescriptions {
          language
          shortDescription
        }
        covers {
          language
          url
        }
        banners {
          language
          url
        }
      }
    }
  }
`)

export default () => {
  const [{ data }] = useSubscription({ query: getReleasingMediaPage, variables: { input: { status: MediaStatus.Releasing } } })

  const media = data?.mediaPage?.nodes || []
  console.log('media', media)

  return (
    <div>
      Home
    </div>
  )
}
