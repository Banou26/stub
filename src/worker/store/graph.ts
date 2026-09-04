export type LabelOptions<T> = {
  merge?: (incoming: T, existing: T) => T
}

export type SetOptions = {
  addLabels?: string[]
  removeLabels?: string[]
}

export type UnionFind = {
  has(key: string): boolean
  find(x: string): string
  union(a: string, b: string): boolean
  component(x: string): ReadonlySet<string>
  allComponents(): Iterable<ReadonlySet<string>>
}

export type Graph<T> = {
  set(key: string, value: T, options?: SetOptions): void
  registerLabel(label: string, options?: LabelOptions<T>): void
  setLabel(key: string, ...labels: string[]): void
  labeled(label: string): ReadonlySet<string>
  get(key: string): T | undefined
  has(key: string): boolean
  alias(alias: string, key: string): void
  resolve(key: string): string
  link(a: string, b: string, label: string): boolean
  edge(from: string, to: string, label: string): boolean
  targets(key: string, label: string): ReadonlySet<string>
  cluster(start: string, label: string): T[]
  clusters(label: string, nodeLabel?: string, uris?: string[]): T[][]
  /** Drop every node, alias, edge and component. Tests only: see `resetStore` in ./db.ts. */
  clear(): void
}

export function createUnionFind(): UnionFind {
  const parent = new Map<string, string>()
  const rank = new Map<string, number>()
  const components = new Map<string, Set<string>>()

  function ensure(x: string): void {
    if (!parent.has(x)) {
      parent.set(x, x)
      rank.set(x, 0)
      components.set(x, new Set([x]))
    }
  }

  function find(x: string): string {
    ensure(x)
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let current = x
    while (current !== root) {
      const next = parent.get(current)!
      parent.set(current, root)
      current = next
    }
    return root
  }

  function union(a: string, b: string): boolean {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA === rootB) return false

    const rankA = rank.get(rootA)!
    const rankB = rank.get(rootB)!

    let newRoot: string, oldRoot: string
    if (rankA < rankB) {
      newRoot = rootB; oldRoot = rootA
    } else if (rankA > rankB) {
      newRoot = rootA; oldRoot = rootB
    } else {
      newRoot = rootA; oldRoot = rootB
      rank.set(newRoot, rankA + 1)
    }

    parent.set(oldRoot, newRoot)
    const newSet = components.get(newRoot)!
    for (const member of components.get(oldRoot)!) newSet.add(member)
    components.delete(oldRoot)
    return true
  }

  function component(x: string): ReadonlySet<string> {
    if (!parent.has(x)) return emptySet
    return components.get(find(x)) ?? emptySet
  }

  function allComponents(): Iterable<ReadonlySet<string>> {
    return components.values()
  }

  function has(key: string): boolean {
    return parent.has(key)
  }

  return { has, find, union, component, allComponents }
}

export function createGraph<T>(): Graph<T> {
  const nodes = new Map<string, T>()
  const aliases = new Map<string, string>()

  const undirected = new Map<string, Map<string, Set<string>>>()
  const directed = new Map<string, Map<string, Set<string>>>()

  const unionFinds = new Map<string, UnionFind>()

  const nodeLabels = new Map<string, Set<string>>()
  const labelIndex = new Map<string, Set<string>>()
  const mergers = new Map<string, (incoming: T, existing: T) => T>()

  function adjFor(store: Map<string, Map<string, Set<string>>>, label: string): Map<string, Set<string>> {
    let adj = store.get(label)
    if (!adj) { adj = new Map(); store.set(label, adj) }
    return adj
  }

  function ufFor(label: string): UnionFind {
    let uf = unionFinds.get(label)
    if (!uf) { uf = createUnionFind(); unionFinds.set(label, uf) }
    return uf
  }

  function set(key: string, value: T, options?: SetOptions): void {
    const existing = nodeLabels.get(key)
    const effective = new Set(existing)
    if (options?.addLabels) for (const l of options.addLabels) effective.add(l)
    if (options?.removeLabels) for (const l of options.removeLabels) effective.delete(l)

    const mergeFns: ((incoming: T, existing: T) => T)[] = []
    for (const label of effective) {
      const fn = mergers.get(label)
      if (fn) mergeFns.push(fn)
    }
    if (mergeFns.length > 1) {
      throw new Error(`Node "${key}" has multiple labels with merge functions: cannot resolve which to use`)
    }

    const current = nodes.get(key)
    const merged = (mergeFns.length === 1 && current != null)
      ? mergeFns[0]!(value, current)
      : value

    nodes.set(key, merged)

    if (existing) {
      for (const l of existing) {
        if (!effective.has(l)) labelIndex.get(l)?.delete(key)
      }
    }
    if (effective.size > 0) {
      nodeLabels.set(key, effective)
      for (const l of effective) {
        if (!labelIndex.has(l)) labelIndex.set(l, new Set())
        labelIndex.get(l)!.add(key)
      }
    } else {
      nodeLabels.delete(key)
    }
  }

  function registerLabel(label: string, options?: LabelOptions<T>): void {
    if (options?.merge) {
      mergers.set(label, options.merge)
    }
    if (!labelIndex.has(label)) {
      labelIndex.set(label, new Set())
    }
  }

  function setLabel(key: string, ...labels: string[]): void {
    if (!nodes.has(key)) return
    let s = nodeLabels.get(key)
    if (!s) { s = new Set(); nodeLabels.set(key, s) }
    for (const label of labels) {
      s.add(label)
      if (!labelIndex.has(label)) labelIndex.set(label, new Set())
      labelIndex.get(label)!.add(key)
    }
  }

  function labeled(label: string): ReadonlySet<string> {
    return labelIndex.get(label) ?? emptySet
  }

  function get(key: string): T | undefined {
    return nodes.get(key) ?? nodes.get(aliases.get(key)!)
  }

  function has(key: string): boolean {
    return nodes.has(key) || aliases.has(key)
  }

  function alias(a: string, key: string): void { aliases.set(a, key) }

  function resolve(key: string): string { return aliases.get(key) ?? key }

  function link(a: string, b: string, label: string): boolean {
    const adj = adjFor(undirected, label)
    const isNew = !adj.get(a)?.has(b)
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
    ufFor(label).union(a, b)
    return isNew
  }

  // Returns whether the edge is NEW, the same contract `link` above has. A caller that re-asserts an
  // edge it already made needs to know nothing changed: `upsertMedia` used to set `changed = true` on
  // every PART_OF whatever the state, so a source re-minting the same handle emitted `media:changed`
  // forever and every listener re-read the store for a graph that had not moved.
  function edge(from: string, to: string, label: string): boolean {
    const adj = adjFor(directed, label)
    const isNew = !adj.get(from)?.has(to)
    if (!adj.has(from)) adj.set(from, new Set())
    adj.get(from)!.add(to)
    return isNew
  }

  function targets(key: string, label: string): ReadonlySet<string> {
    return directed.get(label)?.get(key) ?? emptySet
  }

  function cluster(start: string, label: string): T[] {
    const uf = unionFinds.get(label)
    const members = uf?.has(start) ? uf.component(start) : undefined
    const result: T[] = []
    if (members) {
      for (const key of members) {
        const node = nodes.get(key)
        if (node) result.push(node)
      }
    } else {
      const node = nodes.get(start)
      if (node) result.push(node)
    }
    return result
  }

  function clusters(label: string, nodeLabel?: string, uris?: string[]): T[][] {
    const uf = unionFinds.get(label)
    const visited = new Set<string>()
    const result: T[][] = []

    const seeds: Iterable<string> = uris
      ? uris.map(u => resolve(u))
      : nodeLabel ? labelIndex.get(nodeLabel) ?? emptySet : nodes.keys()

    for (const key of seeds) {
      const root = uf?.has(key) ? uf.find(key) : key
      if (visited.has(root)) continue
      visited.add(root)

      const members = uf?.has(key) ? uf.component(key) : undefined
      const group: T[] = []
      if (members) {
        for (const k of members) {
          const node = nodes.get(k)
          if (node) group.push(node)
        }
      } else {
        const node = nodes.get(key)
        if (node) group.push(node)
      }
      if (group.length > 0) result.push(group)
    }

    return result
  }

  function clear(): void {
    nodes.clear()
    aliases.clear()
    undirected.clear()
    directed.clear()
    unionFinds.clear()
    nodeLabels.clear()
    // the LABELS survive, because `registerLabel` runs once at module load in ./db.ts and a cleared
    // registry would silently drop the merge functions that `set` looks up. Only their contents go.
    for (const keys of labelIndex.values()) keys.clear()
  }

  return {
    set, registerLabel, setLabel, labeled,
    get, has, alias, resolve,
    link, edge, targets,
    cluster, clusters, clear,
  }
}

const emptySet: ReadonlySet<string> = new Set()

/** Merge strategy: scalars last-write-wins, arrays longest-wins. */
export function lastWriteLongestArray<T extends Record<string, unknown>>(incoming: T, existing: T): T {
  const result = { ...existing } as Record<string, unknown>
  for (const key in incoming) {
    const val = incoming[key]
    if (Array.isArray(val)) {
      const ex = existing[key as keyof T]
      result[key] = (Array.isArray(ex) && ex.length > val.length) ? ex : val
    } else {
      result[key] = val ?? existing[key as keyof T]
    }
  }
  return result as T
}
