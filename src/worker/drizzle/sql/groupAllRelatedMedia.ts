import { sql } from 'drizzle-orm'

export default sql`
-- Group all Media items by their relationships

WITH RECURSIVE graph AS (
    -- Start with nodes that have the smallest UID in their component
    SELECT m.uri, m.uri as group_id, 0 as depth
    FROM media m
    WHERE NOT EXISTS (
    SELECT 1 FROM _mediaHandles mh
    WHERE (mh.B = m.uri AND mh.A < m.uri)
        OR (mh.A = m.uri AND mh.B < m.uri)
    )

    UNION

    -- Traverse the graph
    SELECT m.uri, g.group_id, g.depth + 1
    FROM media m
    INNER JOIN _mediaHandles mh ON (m.uri = mh.A OR m.uri = mh.B)
    INNER JOIN graph g ON (
    (g.uri = mh.A AND m.uri = mh.B) OR
    (g.uri = mh.B AND m.uri = mh.A)
    )
    WHERE g.depth < 50
),
groups AS (
    SELECT uri, MIN(group_id) as group_id
    FROM graph
    GROUP BY uri

    UNION

    -- Include standalone media
    SELECT m.uri, m.uri as group_id
    FROM media m
    WHERE NOT EXISTS (
    SELECT 1 FROM _mediaHandles mh
    WHERE mh.A = m.uri OR mh.B = m.uri
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
