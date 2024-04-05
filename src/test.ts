import { makeGraphDatabase } from 'scannarr/src/graph-database/index'

const db = makeGraphDatabase()

const user1 = db.insertOne({
  __typename: 'User',
  uri: 'user1',
  foo: 'foo1',
  friends: [] as UserNode[]
})

const user2 = db.insertOne({
  __typename: 'User',
  uri: 'user2',
  foo: 'foo2',
  friends: []
  // friends: [user1]
})

console.log('test query _id', db.findOne({ _id: user1._id }))

db.updateOne({ _id: user1._id }, data => ({ ...data, friends: [user2] }))

const userWithFriendsMap =
  db
    .mapOne({ _id: user1._id }, (user) => ({
      ...user,
      friends:
        user
          .friends
          .map(friend =>
            db.mapOne(
              { _id: friend._id },
              (friend) =>
                db.mapOne(
                  { _id: friend._id },
                  (friend) => friend
                )
            )
          )

        // db.mapMany(
        //   { _id: { $in: user.friends.map(friend => friend._id) } },
        //   (friend) =>
        //     db.mapOne(
        //       { _id: friend._id },
        //       (friend) => friend
        //     )
        // )
    }))

userWithFriendsMap.subscribe(res => {
  console.log('userWithFriends 2222', res)
})

console.log('findOne uri', db.findOne({ uri: 'user1' }))
db.updateOne({ _id: user2._id }, data => ({ ...data, friends: [user1] }))
