// @ts-expect-error
import FrizbeeWASMUrl from 'frizbee-wasm/pkg/frizbee_bg.wasm?url'
import init from 'frizbee-wasm/pkg'

await init(FrizbeeWASMUrl)
