import { css } from '@emotion/react'

const style = css`
  max-width: 72rem;
  margin: 0 auto;
  padding: 10rem 3rem 6rem;
  color: rgba(255, 255, 255, 0.8);

  h1 {
    font-size: 3rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: 0.6rem;
  }

  .updated {
    font-size: 1.3rem;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 3rem;
  }

  h2 {
    font-size: 1.9rem;
    font-weight: 600;
    color: #fff;
    margin: 3rem 0 1rem;
  }

  p {
    font-size: 1.5rem;
    line-height: 1.7;
    margin-bottom: 1rem;
  }

  a {
    color: #f47521;

    &:hover {
      color: #ff8a3d;
    }
  }
`

const Legal = () => (
  <div css={style}>
    <h1>Legal &amp; Privacy</h1>
    <div className="updated">Last updated 1 June 2026</div>

    <p>
      stub is an independent, non-commercial personal project, provided “as is” without
      warranties of any kind.
    </p>

    <h2>No hosted content</h2>
    <p>
      stub hosts, stores, and distributes no media of its own. All titles, descriptions,
      artwork, ratings, and playback streams are retrieved on demand from third-party
      services — including AniList, MyAnimeList, Crunchyroll, JustWatch, and Netflix — and
      remain the property of their respective owners. You access those services with your
      own accounts and are responsible for complying with their terms.
    </p>

    <h2>Personal use</h2>
    <p>
      stub is a technical showcase of in-browser media aggregation, intended for personal,
      non-commercial use. It is not a content provider.
    </p>

    <h2>Data &amp; privacy</h2>
    <p>
      stub keeps no accounts and stores no personal data. All application data lives
      in-memory in your browser and is cleared when you refresh or close the tab. Network
      requests are routed through the FKN platform to reach the third-party sources above;
      how that data is handled is described in the{' '}
      <a href="https://fkn.app/privacy" target="_blank" rel="noreferrer noopener">
        FKN platform privacy policy
      </a>
      .
    </p>

    <h2>Rights holders</h2>
    <p>
      stub stores no content itself — anything you see lives on the third-party service it
      came from. If you are a rights holder with a concern, you can reach the maintainer
      through the project repository at{' '}
      <a href="https://github.com/Banou26/stub" target="_blank" rel="noreferrer noopener">
        github.com/Banou26/stub
      </a>
      .
    </p>

    <h2>Liability</h2>
    <p>
      stub is provided without warranty of any kind. The maintainer is not liable for any
      damages arising from its use, or for the availability, accuracy, or legality of any
      third-party service it connects to.
    </p>
  </div>
)

export default Legal
