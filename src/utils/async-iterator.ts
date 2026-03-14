
export const mergeAsyncIterators = async function* <T>(...iterators: AsyncIterableIterator<T>[]) {
  const nexts = iterators.map(it => it.next())

  async function* race(promises) {
    if (promises.length === 0) return

    const [value, index] = await Promise.race(
      promises.map((p, i) => p.then(v => [v, i]))
    )

    if (!value.done) {
      yield value.value
      promises[index] = iterators[index]?.next()
      yield* race(promises)
    } else {
      yield* race(promises.filter((_, i) => i !== index))
    }
  }

  yield* race(nexts)
}
