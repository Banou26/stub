import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'

import PreviewModal, { GET_MEDIA } from './anime/preview-modal'

export default () => {


  return <img src="https://artworks.thetvdb.com/banners/v4/episode/9862554/screencap/64c56a26d211f.jpg"/>
  // const [searchParams, setSearchParams] = useSearchParams()
  // const mediaUri = searchParams.get('details')
  // // const { error, data: { Media: media } = {} } = useQuery(GET_MEDIA, { variables: { uri: mediaUri! }, skip: !mediaUri })
  // // console.log('media', media)


  // return <PreviewModal/>
  // return null
}
