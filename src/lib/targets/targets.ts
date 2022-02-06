import type { Target } from '.'

export let targets: Target[] = []

export const addTarget = (target: Target) => {
  return targets = [...targets, target]
}

export const removeTarget = (target: Target) => {
  return targets = targets.filter(_target => _target !== target)
}

export const getTargets = () => [...targets]
