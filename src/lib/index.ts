import { getLatest, search } from './targets'

export * from './discovery'
export * from './genre'

getLatest()
  .then(res =>
    console.log(res)
  )

// search()
//   .then(res =>
//     getLatest(res)
//   )
