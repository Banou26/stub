import { Observable, Subject, combineLatest, firstValueFrom, map, mergeMap, scan, shareReplay, startWith, switchMap } from 'rxjs'

import { merge } from './utils/merge'

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

type NodeData =
  { __typename: string } &
  { [key: string]: any }

type Node<NodeDataType extends NodeData> = {
  id: string
  $: Observable<NodeDataType>
  set: (changes: Partial<NodeDataType>) => Promise<void>
  get: () => Promise<NodeDataType>
  map: <T>(fn: (node: NodeDataType) => T) => Observable<UnwrapObservables<T>>
}

type KeyGenerator = (data: any) => string | null

type KeyingConfig = {
  [typename: string]: KeyGenerator
}

type ExtractObservableType<T> =
  T extends Observable<infer U> ? U :
  T extends Array<infer U> ? ExtractObservableType<U>[] :
  T extends object ? { [key in keyof T]: ExtractObservableType<T[key]> }[keyof T] :
  never

export const getObservables = <T>(value: T): ExtractObservableType<T> => {
  const observables: Observable<T>[] = []
  const recurse = (value: any) =>
    value instanceof Observable ? observables.push(value) :
    Array.isArray(value) ? value.map(recurse) :
    value && typeof value === 'object' ? Object.values(value).map(recurse) :
    undefined

  recurse(value)
  return observables as ExtractObservableType<T>
}

type UnwrapObservables<Value> =
  Value extends Observable<infer T> ? UnwrapObservables<T> :
  Value extends Array<infer T> ? UnwrapObservables<T>[] :
  Value extends Object ? { [key in keyof Value]: UnwrapObservables<Value[key]> } :
  Value

export const replaceObservablePairs = <T>(value: T, replacementPairs: [Observable<any>, any][]): UnwrapObservables<T> =>
  Array.isArray(value) ? value.map(v => replaceObservablePairs(v, replacementPairs)) :
  value instanceof Observable ? replacementPairs.find(([observable]) => observable === value)?.[1] :
  value && typeof value === 'object' ? Object.fromEntries(
    Object
      .entries(value)
      .map(([key, value]) => [
        key,
        replaceObservablePairs(value, replacementPairs)
      ])
  ) :
  value

// todo: add custom merge function
export const makeGraph = <NodeType extends NodeData>(
  { keys }:
  { keys: KeyingConfig }
) => {
  const nodesMap = new Map<string, Node<NodeType>>()
  
  const makeNode = <T extends NodeType>(_node: T) => {
    const id = keys[_node.__typename]?.(_node) as string

    if (nodesMap.has(id)) {
      throw new Error(`Node with id "${id}" already exists`)
    }

    const changesObservable = new Subject<T>()
    const nodeObservable =
      changesObservable
        .pipe(
          startWith(_node),
          shareReplay(1)
        )
      
    if (!id) throw new Error(`No key for ${_node.__typename}`)

    const node = {
      __type__: 'Node',
      id,
      $: nodeObservable,
      set: (changes: Partial<T>) =>
        firstValueFrom(nodeObservable)
          .then(node =>
            changesObservable.next(
              merge(node, changes) as T
            )
          ),
      get: () => firstValueFrom(nodeObservable),
      map: <T2 extends (node: T) => any>(fn: T2) =>
        nodeObservable
          .pipe(
            switchMap(node => {
              const result = fn(node)
              const observables = getObservables(result)
              const allObservablesResults = combineLatest(observables as Observable<any>)
              return (
                allObservablesResults
                  .pipe(
                    map(results =>
                      replaceObservablePairs(
                        result,
                        results.map((result, i) => [
                          (observables as Observable<any>[])[i]!,
                          result
                        ])
                      )
                    )
                  )
              )
            })
          )
    } as Node<T>
    nodesMap.set(id, node as Node<NodeType>)
    return node
  }

  return {
    makeNode
  }
}

type User = {
  __typename: 'User'
  uri: string
  foo: string
  friends: Node<User>[]
}

type Nodes = User

const graph = makeGraph<Nodes>({
  keys: {
    User: user => user.uri
  }
})

const user1 = graph.makeNode({
  __typename: 'User',
  uri: 'user1',
  foo: 'foo1',
  friends: []
} as User)

const user2 = graph.makeNode({
  __typename: 'User',
  uri: 'user2',
  foo: 'foo2',
  friends: [user1]
})

user1.set({ friends: [user2] })

const userWithFriendsMap =
  user1
    .map(user => ({
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
