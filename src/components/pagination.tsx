import { useRef } from 'react'
import { ArrowLeft, ArrowRight } from 'react-feather'
import { css } from '@emotion/react'

const style = css`
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  .pages {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;

    .current {
      padding: .5rem .5rem;
      max-width: 3rem;
      :hover {
        border-radius: .5rem;
      }
    }

    .page {
      padding: .5rem 1rem;
      cursor: pointer;
    }
    .current {
      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
          /* display: none; <- Crashes Chrome on hover */
          -webkit-appearance: none;
          margin: 0; /* <-- Apparently some margin are still there even though it's hidden */
      }
      &[type=number] {
          -moz-appearance:textfield; /* Firefox */
      }

      border-radius: .5rem;
      border: none;
      background-color: #222;
      color: #fff;
      cursor: text;
      border: 1px solid #000;
      :hover {
        border-radius: .5rem;
        background-color: #333;
      }
      :focus {
        outline: solid;
        outline-color: #333;
        outline-width: .1rem;
      }
      ::placeholder {
        text-align: center;
        color: #fff;
      }
    }
    .page {
      :hover {
        background-color: #333;
        border-radius: .5rem;
      }
    }
  }
  .next, .previous, .last, .first {
    &:hover {
      background-color: #333;
      border-radius: .5rem;
    }
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    box-sizing: border-box;
  }
  .previous {
    margin-right: auto;
  }
  .next {
    margin-left: auto;
  }
  .begin, .end {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin: 0!important;
  }
}
`

const DEFAULT_ITEMS_PER_PAGE = 10

export const Pagination = (
  { children, currentPage = 0, itemsPerPage = DEFAULT_ITEMS_PER_PAGE, setCurrentPage = () => {}, totalPages, itemInPagination = 2, position = "top", ...rest }:
  { children: React.ReactNode, currentPage: number, itemsPerPage: number, setCurrentPage: (newPage: number) => void, totalPages: number, itemInPagination?: number, position?: 'top' | 'bottom' }
) => {
  const inputPagination = useRef(null)

  const onClickNextPage = () => {
    setCurrentPage(currentPage + 1)
  }
  const onClickPreviousPage = () => {
    setCurrentPage(currentPage - 1)
  }

  const generatePaginationArray = () => { // generate array of number to display in pagination
    if (!totalPages) return
    const paginationArray = []
    const startPage = Math.max(0, currentPage - itemInPagination)
    const endPage = Math.min(totalPages - 1, currentPage + itemInPagination)

    for (let i = startPage; i <= endPage; i++) {
      paginationArray.push(i)
    }
    return paginationArray
  }

  const handlePaginationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (
      totalPages && inputPagination.current &&
        (Number(inputPagination.current.value) > totalPages ||
        Number(inputPagination.current.value) <= 0 ||
        inputPagination.current.value === '')
    ) return
    setCurrentPage(Number(inputPagination.current.value) - 1)
  }
  
  if (totalPages === 1)
    return (
      <div css={style} {...rest}>
        <ul>
          {children}
        </ul>
      </div>
    )

  return (
    <div css={style} {...rest}>
      {
        position === 'bottom' && (
          <ul>
            {children}
          </ul>
        )
      }
      <div className="pagination">
        {
          totalPages && currentPage >= 1
            ? (
              <div className='begin'>
                <div className='first' onClick={() => { setCurrentPage(0) }}>First</div>
                <div className="previous" onClick={onClickPreviousPage}>
                  <ArrowLeft size={20} />
                </div>
              </div>
              )
            : <div></div>
        }
        <div className="pages">
          {generatePaginationArray()?.map((page) => (
            page === currentPage
              ? (
                <form
                  key={page}
                  onSubmit={(e) => { handlePaginationChange(e) }}
                >
                  <input
                    ref={inputPagination}
                    className='current'
                    placeholder={(currentPage + 1).toString()}
                    type='number'
                    min="1"
                    max={totalPages}
                  />
                </form>
                )
              : (
                <div
                  key={page}
                  className='page'
                  onClick={() => { setCurrentPage(page) }}
                >
                  {page + 1}
                </div>
                )
          ))}
        </div>
        {
          totalPages > (currentPage + 1) && (
            <div className='end'>
              <div className="next" onClick={onClickNextPage}>
                <ArrowRight size={20}/>
              </div>
              <div className='last' onClick={() => { setCurrentPage(totalPages - 1) }}>Last</div>
            </div>
          )
        }
      </div>
      {
        position === 'top' && (
          <ul>
            {children}
          </ul>
        )
      }
    </div>
  )
}