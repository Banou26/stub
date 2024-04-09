import { makeGraphDatabase } from 'scannarr/src/graph-database/index'
import { pathPartToTarget } from 'scannarr/src/graph-database/path'
// import _data from './test-data?raw'
import { fromScannarrUri } from 'scannarr/src/utils'

const transformedData = _data.replaceAll(`\\'`, `'`).replaceAll(`\\"`, `"`)
const data = JSON.parse(transformedData)

const db = makeGraphDatabase()

for (const [key, nodeData] of data) {
  // console.log('inserting', key, nodeData)
  db.insertOne(nodeData)
}
// console.clear()
console.log('data', [...db.nodes.values()])
console.log('scannarr', [...db.nodes.values()].map(node => node.data).filter(handle => handle.__typename === 'Media' && handle.origin === 'scannarr'))

console.log('')
performance.mark('findOne start')
const findResult =
  db.findOne({
    origin: 'scannarr',
    'handles.uri': ['anilist:169778', 'mal:56553']
  })
  // [...db.nodes.values()]
  //   .map(node => node.data)
  //   .filter(node => node.origin === 'scannarr')
  //   .find((scannarrNode) =>
  //     scannarrNode.origin === 'scannarr' &&
  //     fromScannarrUri(scannarrNode.uri)
  //       ?.handleUris
  //       .some(handleUri =>
  //         ['anilist:169778', 'mal:56553']
  //           .some(uri => handleUri === uri)
  //       )
  //   )
  // db.findOne({ uri: 'scannarr:(anilist:172187)' })
performance.mark('findOne end')

console.log('measure', performance.measure('findOne', 'findOne start', 'findOne end'))

console.log('findResult', findResult)


// const user1 = db.insertOne({
//   __typename: 'User',
//   uri: 'user1',
//   origin: 'scannarr',
//   foo: 'foo1',
//   handles: []
// })

// const user2 = db.insertOne({
//   __typename: 'User',
//   uri: 'user2',
//   origin: 'scannarr',
//   foo: 'foo2',
//   handles: []
//   // handles: [user1]
// })

// console.log('test query _id', db.findOne({ _id: user1._id }))

// db.updateOne({ _id: user1._id }, data => ({ ...data, handles: [user2] }))

// const userWithFriendsMap =
//   db
//     .mapOne({ _id: user1._id }, (user) => ({
//       ...user,
//       handles:
//         user
//           .handles
//           .map(handle =>
//             db.mapOne(
//               { _id: handle._id },
//               (handle) =>
//                 db.mapOne(
//                   { _id: handle._id },
//                   (handle) => handle
//                 )
//             )
//           )

//         // db.mapMany(
//         //   { _id: { $in: user.handles.map(handle => handle._id) } },
//         //   (handle) =>
//         //     db.mapOne(
//         //       { _id: handle._id },
//         //       (handle) => handle
//         //     )
//         // )
//     }))

// // userWithFriendsMap.subscribe(res => {
// //   console.log('userWithFriends 2222', res)
// // })

// // console.log('findOne uri', db.findOne({ uri: 'user1' }))

// db.updateOne({ _id: user2._id }, data => ({ ...data, handles: [user1] }))


// console.log('findOne from handles uri', db.findOne({ origin: 'scannarr', 'handles.uri': ['user1'] }))
