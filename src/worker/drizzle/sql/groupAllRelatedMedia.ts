import { sql } from 'drizzle-orm'

export default sql`
-- Group all Media items by their relationships

WITH RECURSIVE graph AS (
    -- Start with nodes that have the smallest URI in their component
    SELECT m.uri, m.uri as group_id, 0 as depth
    FROM media m
    WHERE m.origin != 'ag'
      AND NOT EXISTS (
        SELECT 1 FROM mediaHandles mh
        WHERE (mh.handleUri = m.uri AND mh.mediaUri < m.uri)
           OR (mh.mediaUri = m.uri AND mh.handleUri < m.uri)
    )

    UNION

    -- Traverse the graph
    SELECT m.uri, g.group_id, g.depth + 1
    FROM media m
    INNER JOIN mediaHandles mh ON (m.uri = mh.mediaUri OR m.uri = mh.handleUri)
    INNER JOIN graph g ON (
        (g.uri = mh.mediaUri AND m.uri = mh.handleUri) OR
        (g.uri = mh.handleUri AND m.uri = mh.mediaUri)
    )
    WHERE m.origin != 'ag' AND g.depth < 50
),
groups AS (
    SELECT uri, MIN(group_id) as group_id
    FROM graph
    GROUP BY uri

    UNION

    -- Include standalone media
    SELECT m.uri, m.uri as group_id
    FROM media m
    WHERE m.origin != 'ag'
      AND NOT EXISTS (
        SELECT 1 FROM mediaHandles mh
        WHERE mh.mediaUri = m.uri OR mh.handleUri = m.uri
    )
)
SELECT
    group_id,
    COUNT(*) as group_size,
    GROUP_CONCAT(uri, ', ') as media_uris
FROM groups
GROUP BY group_id
ORDER BY group_size DESC, group_id;
`
