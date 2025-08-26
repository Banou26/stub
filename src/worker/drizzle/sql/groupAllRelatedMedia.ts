import { sql } from 'drizzle-orm'

export default sql`
-- Optimized group all Media items by their relationships
WITH RECURSIVE graph AS (
    -- Start with all nodes and their initial component assignment
    SELECT
        m.uri,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM mediaHandles mh
                WHERE (mh.handleUri = m.uri AND mh.mediaUri < m.uri)
                   OR (mh.mediaUri = m.uri AND mh.handleUri < m.uri)
            ) THEN NULL
            ELSE m.uri
        END as group_id,
        0 as depth,
        m.uri as visited_path
    FROM media m
    WHERE m.origin != 'ag'

    UNION

    -- Traverse the graph using smallest connected URI as group_id
    SELECT
        CASE
            WHEN mh.mediaUri = g.uri THEN mh.handleUri
            ELSE mh.mediaUri
        END as uri,
        CASE
            WHEN g.group_id IS NULL THEN
                CASE
                    WHEN mh.mediaUri = g.uri AND mh.handleUri < g.uri THEN mh.handleUri
                    WHEN mh.handleUri = g.uri AND mh.mediaUri < g.uri THEN mh.mediaUri
                    ELSE g.uri
                END
            ELSE
                CASE
                    WHEN mh.mediaUri = g.uri AND mh.handleUri < g.group_id THEN mh.handleUri
                    WHEN mh.handleUri = g.uri AND mh.mediaUri < g.group_id THEN mh.mediaUri
                    ELSE g.group_id
                END
        END as group_id,
        g.depth + 1 as depth,
        g.visited_path || ',' || CASE
            WHEN mh.mediaUri = g.uri THEN mh.handleUri
            ELSE mh.mediaUri
        END as visited_path
    FROM graph g
    INNER JOIN mediaHandles mh ON (g.uri = mh.mediaUri OR g.uri = mh.handleUri)
    INNER JOIN media m2 ON m2.uri = CASE
        WHEN mh.mediaUri = g.uri THEN mh.handleUri
        ELSE mh.mediaUri
    END
    WHERE g.depth < 50
      AND m2.origin != 'ag'
      AND g.visited_path NOT LIKE '%' || m2.uri || '%'
),
final_groups AS (
    -- Get the minimum group_id for each URI
    SELECT
        uri,
        COALESCE(MIN(NULLIF(group_id, '')), uri) as group_id
    FROM graph
    GROUP BY uri
)
SELECT
    group_id,
    COUNT(*) as group_size,
    GROUP_CONCAT(uri, ', ') as media_uris
FROM final_groups
GROUP BY group_id
HAVING COUNT(*) > 0
ORDER BY group_size DESC, group_id;
`
