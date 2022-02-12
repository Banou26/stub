import type { OptionalToNullable } from './types'

import { makeVar } from '@apollo/client'

export const undefinedToNull = <T>(object: T): OptionalToNullable<T> =>
  // @ts-ignore
  Array.isArray(object)
    ? object.map(undefinedToNull)
    : (
      Object.fromEntries(
        Object
          .entries(object)
          .map(([key, val]) => [
            key,
            val === undefined ? null :
            Array.isArray(val) ? val.map(undefinedToNull) :
            typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.getPrototypeOf({}) ? undefinedToNull(val) :
            val
          ])
      )
    )

export const defineTypename = (object: any, typename: string, setTypename = false) =>
  Array.isArray(object)
    ? object.map(obj => defineTypename(obj, typename, setTypename))
    : ({
      ...setTypename && { __typename: typename },
      // keep the original typename if it exists, we only want to set it if its not defined
      // as this algorithm goes down the tree, we don't want Titles to override Episodes typenames
      ...Object.fromEntries(
        Object
          .entries(object)
          .map(([key, val]) => [
            key,
            Array.isArray(val) ? val.map(_val => defineTypename(_val, typename, key === 'handle' || key === 'handles' ? true : false)) :
            typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.getPrototypeOf({}) ? defineTypename(val, typename, key === 'handle' || key === 'handles' ? true : false) :
            val
          ])
      ) 
    })

export const asyncRead = (fn, query) => {
  return (_, args) => {
      if (!args.storage.var) {
          args.storage.var = makeVar(undefined)
          fn(_, args).then(
              data => {
                  args.storage.var(data)
                  args.cache.writeQuery({
                      query,
                      data: { [args.fieldName]: data }
                  })
              }
          )
      }
      return args.storage.var()
  }
}
