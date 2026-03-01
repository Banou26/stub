import { sql } from 'drizzle-orm'

export const groupRelatedEpisodesByMedia = (aggregatedMediaId: string) => sql`
SELECT
  amh.aggregatedMediaId,
  COALESCE(e.episodeNumber, e.absoluteEpisodeNumber) as groupEpisodeNumber,
  GROUP_CONCAT(e.uri, ',') as grouped_episode_uris,
  COUNT(*) as episode_count
FROM episode e
INNER JOIN aggregatedMediaHandles amh ON e.mediaUri = amh.mediaUri
WHERE COALESCE(e.episodeNumber, e.absoluteEpisodeNumber) IS NOT NULL
  AND amh.aggregatedMediaId = ${aggregatedMediaId}
GROUP BY amh.aggregatedMediaId, COALESCE(e.episodeNumber, e.absoluteEpisodeNumber)
ORDER BY amh.aggregatedMediaId, groupEpisodeNumber;
`
