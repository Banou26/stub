import LegalDoc from '../../components/legal-doc'

const Privacy = () => (
  <LegalDoc>
    <h1>Privacy</h1>
    <div className="updated">Last updated 1 June 2026</div>

    <p>
      stub is an independent, non-commercial personal project. In short: it has no
      accounts, runs no analytics, and keeps nothing about you on a server.
    </p>

    <h2>What stub stores</h2>
    <p>
      stub has no user accounts and no server-side database. Everything it shows is held in
      memory in your browser and is cleared when you refresh or close the tab. It sets no
      advertising or tracking cookies and runs no analytics or telemetry.
    </p>

    <h2>Network requests &amp; third parties</h2>
    <p>
      To fetch titles, artwork, and streams, stub sends requests through the FKN platform
      proxy, which then reaches third-party services such as AniList, MyAnimeList,
      Crunchyroll, JustWatch, and Netflix. The proxy processes only the connection metadata
      needed to route and rate-limit a request (for example your IP address) and requires
      no account; how the FKN platform handles that data is described in the{' '}
      <a href="https://fkn.app/privacy" target="_blank" rel="noreferrer noopener">
        FKN platform privacy policy
      </a>
      . Each third-party service receives the requests made to it and applies its own
      privacy policy, especially when you sign in to one (for example Crunchyroll) to watch.
    </p>

    <h2>The optional browser extension</h2>
    <p>
      If you install the FKN browser extension, it works with your own already-logged-in
      sessions locally on your device so you can play content you have access to. Those
      credentials stay in your browser; stub never receives them.
    </p>

    <h2>Your control</h2>
    <p>
      Because stub stores nothing persistently, closing or refreshing the tab clears all of
      its state. If you use the browser extension, you can review and revoke its access at
      any time from the extension itself.
    </p>

    <h2>Contact</h2>
    <p>
      Questions about privacy can be raised through the project repository at{' '}
      <a href="https://github.com/Banou26/stub" target="_blank" rel="noreferrer noopener">
        github.com/Banou26/stub
      </a>
      .
    </p>
  </LegalDoc>
)

export default Privacy
