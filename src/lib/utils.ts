export const filterTagets =
  (targets, func) =>
    (
      { categories, genres }:
      { categories?: Category[], genres?: Genre[] }
    ) =>
  targets
    .filter(func)
    .filter(target =>
      categories?.some(category => target.categories?.includes(category))
    )
