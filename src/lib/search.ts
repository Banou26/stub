// import filterTar from './utils'


// const filterSearch = filterTagets(({ search }) => search)
// const filterGetLatest = filterTagets(({ getLatest }) => getLatest)

// export const search = ({ search, categories, genres }) => {
//   const filteredTargets = filterSearch({ categories, genres })
//   const results = filteredTargets.map(target => target.search!({ search, categories, genres }))

//   return (
//     Promise
//     .allSettled(results)
//     .then(results =>
//       results
//         .filter(result => result.status === 'fulfilled')
//         .flatMap((result) => (result as unknown as PromiseFulfilledResult<SearchResult>).value)
//     )
//   )
// }
