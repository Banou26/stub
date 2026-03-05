import { render } from 'preact'
import { getPlayer } from './sources/players'

const params = new URLSearchParams(globalThis.location.search)
const url = params.get('url')

const Player = url ? getPlayer(url) : undefined

const App = () => {
  if (!url || !Player) return <div>Unsupported or missing url</div>
  return <Player url={url} />
}

render(<App />, document.body)
