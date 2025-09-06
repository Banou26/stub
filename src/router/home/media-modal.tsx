import { css } from '@emotion/react'
import {
  FloatingFocusManager, FloatingOverlay, FloatingPortal,
  useClick, useFloating, useInteractions
} from '@floating-ui/react'
import { useState } from 'preact/hooks'
import { Redirect, useParams } from 'wouter'

const style = css`
padding: 5rem;
background-color: hsla(0, 0%, 0%, 0.439);
animation: overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
.modal {
  display: flex;
  flex-direction: column;
  width: 120rem;
  height: 200rem;
  background-color: rgb(35, 35, 35);
  border-radius: 1rem;
  box-shadow: hsl(206 22% 7% / 35%) 0px 10px 38px -10px, hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
  overflow: hidden;
  margin: auto;
}
`

export default () => {
  const params = useParams()
  const [open, onOpenChange] = useState(Boolean(params))
  const { refs, context } = useFloating({
    open,
    onOpenChange: (_, ev) => {
      if (ev?.target !== refs.reference.current) return
      onOpenChange(false)
    }
  })
  const click = useClick(context)
  const {getReferenceProps, getFloatingProps} = useInteractions([click])

  if (!open) return <Redirect to="/" />

  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll css={style} ref={refs.setReference} {...getReferenceProps()}>
        <FloatingFocusManager context={context}>
          <div className='modal' ref={refs.setFloating} {...getFloatingProps()}>
            Foo
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  )
}
