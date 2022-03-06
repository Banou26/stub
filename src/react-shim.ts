import React from "react"
import { jsx } from "@emotion/react"
import buffer from 'buffer'

// @ts-ignore
globalThis.Buffer = buffer.Buffer
globalThis.global = globalThis
if (!globalThis.process) {
  globalThis.process = {
    env: {
      NODE_DEBUG: 'false',
    },
    cwd: () => '/',
    'platform': 'linux',
    // @ts-ignore
    'browser': true,
    'nextTick': (func, ...args) => setTimeout(() => func(...args), 0),
    'version': '"v16.6.0"'
  }
}

export { React, jsx }
