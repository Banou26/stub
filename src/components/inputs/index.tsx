import type { CheckboxSpecificInputParameters } from './checkbox'

import React, { InputHTMLAttributes } from 'react'

import InputText from './text'
import InputEmail from './email'
import InputPassword from './password'
import InputCheckbox from './checkbox'

export interface InputParameters {
  name?: string
  label?: string
  error?: string
  disabled?: boolean
}

export default React.forwardRef<
  HTMLInputElement,
  InputParameters
  & Partial<CheckboxSpecificInputParameters>
  & { type: string }
  & Omit<InputHTMLAttributes<HTMLInputElement>, 'checked'>
>(({ type, ...props }, ref) => {
  if (type === 'checkbox' && props.name) return <InputCheckbox ref={ref} name={props.name} {...props}/>
  if (props.checked === null) throw new Error('Non checkbox input shouldn\'t have a checked property value as null')
  if (type === 'text') return <InputText ref={ref} {...props} checked={props.checked}/>
  if (type === 'email') return <InputEmail ref={ref} {...props} checked={props.checked}/>
  if (type === 'password') return <InputPassword ref={ref} {...props} checked={props.checked}/>
  return <input ref={ref} type={type} {...props} checked={props.checked}/>
})
