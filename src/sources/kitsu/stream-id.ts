// The id a Kitsu streaming link contributes as a handle, or undefined when it carries none.
//
// Split out of extractor.ts so it can be tested: that module reaches the source barrel, which cannot
// be loaded outside a browser.
//
// A handle's id has to be an id in that provider's OWN space. It is what clusters this media with the
// provider's source, and it rides inside `ag:(...)` and inside a single route segment. Falling back to
// the whole url when the path shape is unrecognised broke both at once: a Crunchyroll link with no
// '/series/' segment minted
//
//   cr:https://www.crunchyroll.com/mushoku-tensei-jobless-reincarnation
//
// whose two extra slashes made '/watch/:mediaUri/:episodeUri' unmatchable, so opening an episode
// rendered the catch-all "404 No page found" with nothing on screen to point at. A url is not an
// identity in any case - it clusters with nothing - so a link we cannot read an id out of is dropped.
const ID_IN_PATH = /\/(?:series|title|watch|shows?)\/([^/?#]+)/

export const streamContentId = (url: string): string | undefined => ID_IN_PATH.exec(url)?.[1]
