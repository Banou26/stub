// ─── Types ───────────────────────────────────────────────────────────────────

export type LabelOptions<T> = {
  merge?: (incoming: T, existing: T) => T
}

export type SetOptions = {
  addLabels?: string[]
  removeLabels?: string[]
}

// ─── Minimalist labeled graph ────────────────────────────────────────────────

/**
 * In-memory graph: typed nodes keyed by string, with labeled undirected
 * and directed edges. BFS cluster traversal filtered by edge label.
 */
export class Graph<T> {
  private nodes = new Map<string, T>()
  private aliases = new Map<string, string>() // alias → canonical key

  // label → key → Set<key>
  private undirected = new Map<string, Map<string, Set<string>>>()
  private directed = new Map<string, Map<string, Set<string>>>()

  // node labels
  private nodeLabels = new Map<string, Set<string>>()     // node key → label names
  private labelIndex = new Map<string, Set<string>>()     // label name → node keys
  private mergers = new Map<string, (incoming: T, existing: T) => T>()  // label → merge fn

  // ── Nodes ──────────────────────────────────────────────────────────────────

  set(key: string, value: T, options?: SetOptions): void {
    // Compute effective labels
    const existing = this.nodeLabels.get(key)
    const effective = new Set(existing)
    if (options?.addLabels) for (const l of options.addLabels) effective.add(l)
    if (options?.removeLabels) for (const l of options.removeLabels) effective.delete(l)

    // Find merge function
    const mergeFns: ((incoming: T, existing: T) => T)[] = []
    for (const label of effective) {
      const fn = this.mergers.get(label)
      if (fn) mergeFns.push(fn)
    }
    if (mergeFns.length > 1) {
      throw new Error(`Node "${key}" has multiple labels with merge functions: cannot resolve which to use`)
    }

    // Merge or overwrite
    const current = this.nodes.get(key)
    const merged = (mergeFns.length === 1 && current != null)
      ? mergeFns[0]!(value, current)
      : value

    this.nodes.set(key, merged)

    // Update label indexes
    if (existing) {
      for (const l of existing) {
        if (!effective.has(l)) this.labelIndex.get(l)?.delete(key)
      }
    }
    if (effective.size > 0) {
      this.nodeLabels.set(key, effective)
      for (const l of effective) {
        if (!this.labelIndex.has(l)) this.labelIndex.set(l, new Set())
        this.labelIndex.get(l)!.add(key)
      }
    } else {
      this.nodeLabels.delete(key)
    }
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  /** Register a node label with optional merge strategy. */
  registerLabel(label: string, options?: LabelOptions<T>): void {
    if (options?.merge) {
      this.mergers.set(label, options.merge)
    }
    if (!this.labelIndex.has(label)) {
      this.labelIndex.set(label, new Set())
    }
  }

  /** Add labels to a node without triggering merge. */
  setLabel(key: string, ...labels: string[]): void {
    if (!this.nodes.has(key)) return
    let set = this.nodeLabels.get(key)
    if (!set) { set = new Set(); this.nodeLabels.set(key, set) }
    for (const label of labels) {
      set.add(label)
      if (!this.labelIndex.has(label)) this.labelIndex.set(label, new Set())
      this.labelIndex.get(label)!.add(key)
    }
  }

  /** All node keys carrying a given label. */
  labeled(label: string): ReadonlySet<string> {
    return this.labelIndex.get(label) ?? emptySet
  }

  get(key: string): T | undefined {
    return this.nodes.get(key) ?? this.nodes.get(this.aliases.get(key)!)
  }

  has(key: string): boolean {
    return this.nodes.has(key) || this.aliases.has(key)
  }

  /** Register an alias that resolves to a canonical key. */
  alias(alias: string, key: string): void { this.aliases.set(alias, key) }

  /** Resolve an alias to its canonical key (or return the key itself). */
  resolve(key: string): string { return this.aliases.get(key) ?? key }

  // ── Edges ──────────────────────────────────────────────────────────────────

  private adjFor(store: Map<string, Map<string, Set<string>>>, label: string): Map<string, Set<string>> {
    let adj = store.get(label)
    if (!adj) { adj = new Map(); store.set(label, adj) }
    return adj
  }

  /** Undirected edge. Returns true if new. */
  link(a: string, b: string, label: string): boolean {
    const adj = this.adjFor(this.undirected, label)
    const isNew = !adj.get(a)?.has(b)
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
    return isNew
  }

  /** Directed edge from → to. */
  edge(from: string, to: string, label: string): void {
    const adj = this.adjFor(this.directed, label)
    if (!adj.has(from)) adj.set(from, new Set())
    adj.get(from)!.add(to)
  }

  /** Directed-edge targets. */
  targets(key: string, label: string): ReadonlySet<string> {
    return this.directed.get(label)?.get(key) ?? emptySet
  }

  // ── Traversal ──────────────────────────────────────────────────────────────

  /** BFS from `start` following undirected edges with `label`. */
  cluster(start: string, label: string): T[] {
    const adj = this.undirected.get(label)
    const visited = new Set<string>()
    const result: T[] = []
    const queue = [start]
    while (queue.length > 0) {
      const key = queue.shift()!
      if (visited.has(key)) continue
      visited.add(key)
      const node = this.nodes.get(key)
      if (node) result.push(node)
      for (const neighbor of adj?.get(key) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor)
      }
    }
    return result
  }

  /** All connected components for undirected `label`, optionally seeded from nodes with `nodeLabel`. */
  clusters(label: string, nodeLabel?: string): T[][] {
    const adj = this.undirected.get(label)
    const visited = new Set<string>()
    const result: T[][] = []
    const seeds = nodeLabel ? this.labelIndex.get(nodeLabel) ?? emptySet : this.nodes.keys()
    for (const key of seeds) {
      if (visited.has(key)) continue
      const group: T[] = []
      const queue = [key]
      while (queue.length > 0) {
        const k = queue.shift()!
        if (visited.has(k)) continue
        visited.add(k)
        const node = this.nodes.get(k)
        if (node) group.push(node)
        for (const neighbor of adj?.get(k) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor)
        }
      }
      if (group.length > 0) result.push(group)
    }
    return result
  }
}

const emptySet: ReadonlySet<string> = new Set()

// ─── Merge strategies ───────────────────────────────────────────────────────

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
