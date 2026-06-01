import { Link } from 'wouter'

import { getRoutePath, Route } from '../path'
import LegalDoc from '../../components/legal-doc'

const Legal = () => (
  <LegalDoc>
    <h1>Legal &amp; Terms</h1>
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

    <h2>Privacy</h2>
    <p>
      stub keeps no accounts and stores no personal data. See the{' '}
      <Link href={getRoutePath(Route.PRIVACY)}>Privacy page</Link> for what is and isn’t
      handled when you use it.
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
  </LegalDoc>
)

export default Legal
