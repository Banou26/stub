import type { InputHTMLAttributes } from 'react'

import type { InputParameters } from '.'

import { css } from '@emotion/react'
import { useState, useRef, useEffect, forwardRef } from 'react'
import { Control, useController } from 'react-hook-form'

const get = (obj: any, path: string, defaultValue?: any) => {
  const result = path
    .split(/[,[\].]+?/)
    .filter(Boolean)
    .reduce(
      (result, key) => (result === undefined || result === null ? result : result[key]),
      obj,
    )
  return result === undefined || result === obj
    ? obj[path] || defaultValue
    : result
}

const style = css`

`

export interface CheckboxSpecificInputParameters {
  name: string
  checked?: boolean | null
  control?: Control<any>
  enableIndeterminate?: boolean
}

export const ControlledInput = ({ control, name, checked: _checked, enableIndeterminate, ...props }) => {
  const value = get(control._defaultValues, name)
  const [indeterminate, setIndeterminate] = useState(control && value === null ? true : false)
  const [checked, setChecked] = useState(control && typeof value === 'boolean' ? !!value : _checked)
  
  const { field: { onChange }, fieldState: { isTouched } } = useController({ control, name, ...props })
  const elemRef = useRef<HTMLInputElement>(null)
  const { current: elem } = elemRef

  useEffect(() => {
    if (!elem) return
    elem.indeterminate = indeterminate
  }, [elem, indeterminate])

  return (
    <input
        type="checkbox"
        ref={elemRef}
        checked={!!checked}
        className={isTouched ? 'touched' : ''}
        {
          ...control
            ? {
              ...props,
              onChange: () => {
                if (enableIndeterminate) {
                  if (checked) {
                    setChecked(false)
                    setIndeterminate(true)
                    onChange(null)
                    return null
                  } else if (indeterminate) {
                    setChecked(false)
                    setIndeterminate(false)
                    onChange(false)
                    return false
                  } else {
                    setChecked(true)
                    setIndeterminate(false)
                    onChange(true)
                    return true
                  }
                }
                setChecked(!checked)
                onChange(!checked)
                return !checked
              }
            }
            : {
              ...props,
              ref: elemRef,
              defaultChecked: value
            }
        }
      />
  )
}

export default forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'checked'> & InputParameters & CheckboxSpecificInputParameters>(({
  checked = false,
  label,
  error,
  enableIndeterminate,
  control,
  name,
  ...props
}, ref) =>
  <label css={style}>
    <span className="label">{label}</span>
    {
      control
        ? (
          <ControlledInput
            checked={checked}
            label={label}
            error={error}
            enableIndeterminate={enableIndeterminate}
            control={control}
            name={name}
            {...props}
          />
        )
        : <input type="checkbox" ref={ref} checked={!!checked} name={name} {...props}/>
    }
    <span className="error">{error}</span>
  </label>
)
