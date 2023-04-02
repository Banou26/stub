/// <reference types="@emotion/react/types/css-prop" />
import './vite-hmr'
import { css, Global } from '@emotion/react'
import { createRoot } from 'react-dom/client'

import Mount from './components'
import { makeServer } from 'scannarr'
import { targets } from 'laserr'
import { ApolloClient, ApolloProvider, InMemoryCache } from '@apollo/client'
import { fetch } from './utils/fetch'

const style = css`
  @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;600;700&family=Fira+Sans:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,500;1,600;1,700;1,800;1,900&family=Montserrat:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&display=swap');

  :root {
    color-scheme: dark;
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html {
    font-size: 62.5%;
    height: 100vh;
    width: 100%;
  }

  body {
    margin: 0;
    height: 100vh;
    width: 100%;
    font-size: 1.6rem;
    font-family: Fira Sans;
    background-color: #0f0f0f;
    color: #fff;
    
    font-family: Montserrat;
    // font-family: "Segoe UI", Roboto, "Fira Sans",  "Helvetica Neue", Arial, sans-serif;
  }


  /* @media
  screen and (max-width : 2560px),
  screen and (max-height : 1440px) {
    html {
      font-size: 41.875%;
    }

    body {
      font-size: 2.38805970149rem;
    }
  } */
  

  body > div {
    height: 100vh;
    width: 100%;
  }

  a {
    color: #777777;
    text-decoration: none;
  }

  a:hover {
    color: #fff;
    text-decoration: underline;
  }

  ul {
    list-style: none;
  }
`

const { server, link } = makeServer({
  context: () => ({
    fetch: (...args) => fetch(...args)
  }),
  resolvers: [
    ...targets
  ]
})

server.start()
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link
})

const root = createRoot(document.body.appendChild(document.createElement('div')))

root.render(
  <ApolloProvider client={client}>
    <Global styles={style}/>
    <Mount/>
  </ApolloProvider>
)
