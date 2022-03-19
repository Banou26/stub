
import { css } from '@emotion/react'
import { Link } from 'raviger'
import { Fragment, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDebounce } from 'react-use'
import { Category, searchTitle, TitleHandle } from 'src/lib'
import { useFetch } from 'src/lib/hooks/utils'

import Input from './inputs'

const style = css`
  height: 6rem;
  width: 100%;

  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: center;

  /* border-bottom: 1px solid rgb(35, 35, 35); */
  /* background-color: rgb(35, 35, 35); */
  color: white;
  
  user-select: none;
  padding: 0 4rem;

  .left {
    display: grid;
    grid-template-columns: 26rem auto;
  }

  .middle {
    position: relative;
    display: grid;

    .searchResults {
      position: absolute;
      display: grid;
      bottom: 0;
      top: 50px;
      width: 100rem;
      background-color: rgb(35, 35, 35);
      height: fit-content;
      a {
        display: grid;
        grid-template-columns: 5rem auto;
        align-items: center;
        height: 5rem;
        padding-left: 2.5rem;

        img {
          height: 5rem;
        }
      }
    }
  }

  .right {
    display: grid;
    justify-items: end;
    align-items: center;
  }
`

const Header = ({ category }: { category?: Category }) => {
  const [showSearchResults, setShowSearchResults] = useState(false)
  const { register, watch, handleSubmit, getFieldState } = useForm()
  const search = watch('search')
  const [searchValue, setSearchValue] = useState(undefined)
  const { loading, data, error, refetch } = useFetch<TitleHandle[]>(() => {
    return searchTitle({ categories: [category!], search: searchValue })
  }, { skip: !searchValue })


  useDebounce(() => {
    if (!search?.length) return
    setSearchValue(search)
    if (data) refetch()
    setShowSearchResults(true)
  }, 500, [watch('search')])

  const onSubmit = (v) => {
  }

  const _showSearchResults = () => setShowSearchResults(true)

  const hideSearchResults = () => setShowSearchResults(false)

  return (
    <Fragment>
      <header css={style}>
        <div className="left">
        </div>
        <div className="middle">
         <form onSubmit={handleSubmit(onSubmit)}>
            <Input type="text" placeholder='Search' {...register('search', { onBlur: hideSearchResults })} onFocus={_showSearchResults} autoComplete="off"/>
          </form>
          {
            showSearchResults && data ? (
              <div className="searchResults">
                {
                  data.map(title =>
                    <Link key={title.uri} href={`/title/${title.uri}`}>
                      <img src={title.images.at(0)?.url} alt="" />
                      <span style={{ color: 'white' }}>{title.names.at(0)?.name}</span>
                    </Link>
                  )
                }
              </div>
            ) : null
          }
        </div>
        <div className="right">
        </div>
      </header>
    </Fragment>
  )
}

export default Header
