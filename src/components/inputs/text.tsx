import { InputHTMLAttributes } from 'react'

import type { InputParameters } from '.'

import { css } from '@emotion/react'
import { useState, forwardRef } from 'react'

export const style = css`
  .title {
    color: white;
    font-family: Roboto;
    font-size: 1.8rem;
    line-height: 2.1rem;
  }

  .error {
    font-family: Roboto;
    font-size: 1.5rem;
    line-height: 2.1rem;
    color: firebrick;
  }

  input {
    font-size: 1.6rem;
    color: #fff;
    caret-color: #fff;
    border-radius: .5rem;
    border: .1rem solid rgb(66, 66, 66);

    width: 100%;
    padding: .5rem;
    margin: .25rem 0;
    @media (min-width: 2560px) {
      padding: 1rem;
      margin-top: .5rem;
    }

    outline: none;
    transition: box-shadow 200ms;

    --background-color: rgb(51, 51, 51);
    background-color: var(--background-color);
    &:focus {
      box-shadow: 0 0 1rem var(--background-color);
    }
  }

  input.touched:required:invalid {
    border-color: red;
    transition: border-color 0.1s;
  }

`

export default forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InputParameters>(({ label, error, ...props }, ref) => {
  const [touched, setTouched] = useState(false)
  
  return (
    <label css={style}>
      <span className="label">{label}</span>
      <input 
        type="text" 
        ref={ref} 
        className={`${touched ? 'touched' : ''}`} 
        onBlur={() => setTouched(true)}
        {...props}
      />
      <span className="error">{error}</span>
    </label>
  )
})
