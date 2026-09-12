import type { TraceBlob } from './model'

import { css } from '@emotion/react'

const valueStyle = css`
  &.nothing {
    color: rgb(250, 204, 21);
    font-style: italic;
  }
`

/**
 * One value from the bundle, rendered without lying about it.
 *
 * A null is the word `null` and an absent field is the word `absent`, both marked so they cannot be
 * mistaken for content. NEVER a dash, a blank or an em rule: this page exists to answer why something
 * is missing, and a placeholder that looks like data is the one thing that makes it useless. An empty
 * string says `empty` for the same reason, since a row that renders as nothing reads as a bug in the
 * page rather than a fact about the graph.
 */
export const Value = ({ value }: { value: string | number | boolean | null | undefined }) => {
  if (value === null) return <span css={valueStyle} className="nothing">null</span>
  if (value === undefined) return <span css={valueStyle} className="nothing">absent</span>
  if (value === '') return <span css={valueStyle} className="nothing">empty</span>
  return <span css={valueStyle}>{String(value)}</span>
}

const blobStyle = css`
  .fields {
    width: 100%;
    border-collapse: collapse;
    font-size: 1.2rem;

    th, td {
      padding: 0.2rem 0.6rem 0.2rem 0;
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }

    th {
      width: 14rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.55);
      font-family: monospace;
    }

    td { font-family: monospace; overflow-wrap: anywhere; }
  }

  .raw {
    margin: 0;
    padding: 0.5rem 0.6rem;
    background: rgba(255, 255, 255, 0.05);
    border-left: 2px solid rgb(250, 204, 21);
    font-family: monospace;
    font-size: 1.2rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
`

/**
 * An `evidence` or `gates` blob as a small table of fields.
 *
 * A TABLE and not a dumped string, because the rule that wrote it put named fields in there and the
 * reader is looking for one of them. Text that does not parse as JSON is shown raw and SAID to be
 * raw, which is a fact about the edge rather than a reason to render nothing.
 */
export const JsonBlob = ({ blob, label }: { blob: TraceBlob, label: string }) => (
  <div css={blobStyle} className="blob" data-blob={label}>
    {blob.kind === 'absent' && <div className="absent"><Value value={null}/></div>}
    {blob.kind === 'raw' && (
      <>
        <div className="note">not JSON, shown as it is stored</div>
        <pre className="raw">{blob.raw}</pre>
      </>
    )}
    {blob.kind === 'fields' && (
      <table className="fields">
        <tbody>
          {blob.fields.map(field => (
            <tr key={field.field} data-field={field.field}>
              <th scope="row">{field.field}</th>
              <td><Value value={field.value}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)
