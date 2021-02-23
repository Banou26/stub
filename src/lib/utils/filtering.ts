
export const makeUniqueArrayFilter =
  (func: (obj: any) => string) =>
    (arr: any[]) =>
      [...new Set(arr.map(func))]
        .map(key =>
          arr.find(item => func(item) === key)
        )
