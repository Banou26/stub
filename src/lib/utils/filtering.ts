
export const makeUniqueArrayFilter =
  <T>(func: (obj: T) => string) =>
    (arr: T[]): T[] =>
      [...new Set(arr.map(func))]
        .map(key =>
          arr.find(item => func(item) === key)
        )
        .filter(Boolean) as T[]
