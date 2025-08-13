-- Detailed version: List all Media items with their relationship group information
-- Shows each media item with its group ID and related items count

WITH RECURSIVE media_graph AS (
  -- Build the complete graph of relationships
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    m.type,
    m.status,
    -- Use the smallest connected UID as the group identifier
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM _mediaHandles mh 
        WHERE (mh.A = m.uid AND mh.B < m.uid) 
           OR (mh.B = m.uid AND mh.A < m.uid)
      ) THEN NULL
      ELSE m.uid
    END as group_root,
    0 as depth,
    m.uid as visited_from
  FROM media m
  
  UNION
  
  -- Traverse all connections
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    m.type,
    m.status,
    COALESCE(mg.group_root, 
      CASE 
        WHEN m.uid < mg.visited_from THEN m.uid 
        ELSE mg.visited_from 
      END
    ) as group_root,
    mg.depth + 1,
    m.uid as visited_from
  FROM media m
  INNER JOIN _mediaHandles mh ON (m.uid = mh.A OR m.uid = mh.B)
  INNER JOIN media_graph mg ON (
    (mg.uid = mh.A AND m.uid = mh.B) OR 
    (mg.uid = mh.B AND m.uid = mh.A)
  )
  WHERE mg.depth < 100
    AND mg.group_root IS NOT NULL
),
-- Normalize to get the minimum group root for each media
media_with_groups AS (
  SELECT 
    uid,
    title,
    origin,
    id,
    language,
    type,
    status,
    MIN(COALESCE(group_root, uid)) as group_id
  FROM media_graph
  WHERE group_root IS NOT NULL
  GROUP BY uid, title, origin, id, language, type, status
  
  UNION
  
  -- Include standalone media items
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    m.type,
    m.status,
    m.uid as group_id
  FROM media m
  WHERE NOT EXISTS (
    SELECT 1 FROM _mediaHandles mh 
    WHERE mh.A = m.uid OR mh.B = m.uid
  )
),
-- Calculate group statistics
group_stats AS (
  SELECT 
    group_id,
    COUNT(*) as group_size,
    GROUP_CONCAT(DISTINCT origin) as origins_in_group
  FROM media_with_groups
  GROUP BY group_id
)
-- Final result with detailed information
SELECT 
  mwg.uid,
  mwg.title,
  mwg.origin,
  mwg.id,
  mwg.language,
  mwg.type,
  mwg.status,
  mwg.group_id,
  gs.group_size,
  gs.origins_in_group,
  CASE 
    WHEN gs.group_size = 1 THEN 'Standalone'
    WHEN gs.group_size <= 5 THEN 'Small Group'
    WHEN gs.group_size <= 20 THEN 'Medium Group'
    ELSE 'Large Group'
  END as group_category
FROM media_with_groups mwg
INNER JOIN group_stats gs ON mwg.group_id = gs.group_id
ORDER BY gs.group_size DESC, mwg.group_id, mwg.title;