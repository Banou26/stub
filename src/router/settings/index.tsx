import { useEffect, useState } from 'preact/hooks'
import { css } from '@emotion/react'

import { keyConfigs } from '../../sources/key-configs'
import { loadKeys, saveKeys } from '../../utils/keys'

const style = css`
  max-width: 720px;
  margin: 6rem auto 4rem;
  padding: 0 1.5rem;

  h1 { font-size: 2rem; margin-bottom: .25rem; }
  h2 { font-size: 1.15rem; margin: 2rem 0 .25rem; }
  .intro { opacity: .75; line-height: 1.55; }

  .keys { display: flex; flex-direction: column; gap: 1.5rem; margin: 1.5rem 0; }
  .key-field { display: flex; flex-direction: column; gap: .4rem; }
  .key-field label { font-weight: 600; }
  .key-field input {
    padding: .6rem .8rem;
    border-radius: .4rem;
    border: 1px solid rgba(255, 255, 255, .18);
    background: rgba(255, 255, 255, .05);
    color: inherit;
    font-family: monospace;
  }
  .key-field input:focus { outline: none; border-color: rgba(255, 255, 255, .45); }
  .help { font-size: .82rem; opacity: .65; }
  .help a { color: inherit; text-decoration: underline; }

  .actions { display: flex; align-items: center; gap: 1rem; margin-top: .5rem; }
  button {
    padding: .55rem 1.3rem;
    border-radius: .4rem;
    border: none;
    cursor: pointer;
    background: #fff;
    color: #000;
    font-weight: 600;
  }
  .saved { color: #4ade80; font-size: .9rem; }
`

const Settings = () => {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => { setKeys(loadKeys()) }, [])

  const onSubmit = (event: Event) => {
    event.preventDefault()
    saveKeys(keys)
    setSaved(true)
    setTimeout(() => setSaved(false), 2_000)
  }

  return (
    <div css={style}>
      <h1>Settings</h1>
      <h2>API keys</h2>
      <p className="intro">
        Some sources need your own API key. Keys are kept in this browser only and are used
        solely to authenticate your requests to that source — leave a field blank to keep its
        source disabled.
      </p>
      <form className="keys" onSubmit={onSubmit}>
        {keyConfigs.map(config => (
          <div className="key-field" key={config.origin}>
            <label htmlFor={config.origin}>{config.label}</label>
            <input
              id={config.origin}
              type="password"
              autoComplete="off"
              spellcheck={false}
              placeholder={`Paste your ${config.name} key`}
              value={keys[config.origin] ?? ''}
              onInput={event => setKeys({ ...keys, [config.origin]: (event.target as HTMLInputElement).value })}
            />
            <span className="help">
              {config.help ? `${config.help} ` : ''}
              <a href={config.getUrl} target="_blank" rel="noreferrer">Get a key →</a>
            </span>
          </div>
        ))}
        <div className="actions">
          <button type="submit">Save</button>
          {saved && <span className="saved">Saved</span>}
        </div>
      </form>
    </div>
  )
}

export default Settings
