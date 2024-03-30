import { makeInMemoryGraphDatabase, Node } from 'scannarr/src/urql/graph'

const recursiveRemoveNullable = (obj) =>
  Array.isArray(obj)
    ? obj.map(recursiveRemoveNullable)
    : (
      typeof obj === 'object'
        ? (
          Object
            .fromEntries(
              Object
                .entries(obj)
                .filter(([_, value]) => value !== null && value !== undefined)
                .map(([key, value]) => [key, recursiveRemoveNullable(value)])
            )
        )
        : obj
    )

type User = {
  _id: string
  __typename: 'User'
  uri: string
  foo: string
  // friends: User[]
  friends: UserNode[]
}

type UserNode = Node<User>

type Nodes = User

const db = makeInMemoryGraphDatabase<Nodes>({})

const user1 = db.insertOne({
  __typename: 'User',
  uri: 'user1',
  foo: 'foo1',
  friends: [] as UserNode[]
}, { returnNode: true })

const user2 = db.insertOne({
  __typename: 'User',
  uri: 'user2',
  foo: 'foo2',
  friends: []
  // friends: [user1]
}, { returnNode: true })

db.updateOne({ _id: user1._id }, { $set: { friends: [user2] } })

const userWithFriendsMap =
  user1
    .map((user) => ({
      ...user,
      friends:
        user
        .friends
        .map(friend =>
          friend.map(friend2 => ({
            ...friend2,
            friends: friend2.friends.map(friend3 => friend3.$)
          }))
        )
    }))

userWithFriendsMap.subscribe(res => {
  console.log('userWithFriends 2222', res)
})

console.log('findOne', db.findOne({ uri: 'user1' }))
db.updateOne({ _id: user2._id }, { $set: { friends: [user1] } })
