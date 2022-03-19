import type { InputHTMLAttributes} from 'react'

import type { InputParameters } from '.'

import { useState, forwardRef } from 'react'

import { style } from './text'

export default forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InputParameters>(({ label, error, ...props }, ref) => {
  const [touched, setTouched] = useState(false)

  return (
    <label css={style}>
      <span className="label">{label}</span>
      <input 
        type="password" 
        placeholder="••••••••"
        ref={ref}
        className={`${touched ? 'touched' : ''}`} 
        onBlur={() => setTouched(true)}
        {...props}
      />
      <span className="error">{error}</span>
    </label>
  )
})
