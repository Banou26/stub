import { sql } from 'drizzle-orm'

export default sql`
SELECT
  amh.aggregatedMediaId,
  e.absoluteEpisodeNumber,
  GROUP_CONCAT(e.uri, ',') as grouped_episode_uris,
  COUNT(*) as episode_count
FROM episode e
INNER JOIN aggregatedMediaHandles amh ON e.mediaUri = amh.mediaUri
WHERE e.absoluteEpisodeNumber IS NOT NULL
GROUP BY amh.aggregatedMediaId, e.absoluteEpisodeNumber
ORDER BY amh.aggregatedMediaId, e.absoluteEpisodeNumber;
`
