-- List all Media with their relationship group details

WITH RECURSIVE graph AS (
  -- Start with nodes that have the smallest UID in their component
  SELECT m.uid, m.uid as group_id, 0 as depth
  FROM media m
  WHERE NOT EXISTS (
    SELECT 1 FROM _mediaHandles mh 
    WHERE (mh.B = m.uid AND mh.A < m.uid) 
       OR (mh.A = m.uid AND mh.B < m.uid)
  )
  
  UNION
  
  -- Traverse the graph
  SELECT m.uid, g.group_id, g.depth + 1
  FROM media m
  INNER JOIN _mediaHandles mh ON (m.uid = mh.A OR m.uid = mh.B)
  INNER JOIN graph g ON (
    (g.uid = mh.A AND m.uid = mh.B) OR 
    (g.uid = mh.B AND m.uid = mh.A)
  )
  WHERE g.depth < 50
),
groups AS (
  SELECT uid, MIN(group_id) as group_id
  FROM graph
  GROUP BY uid
  
  UNION
  
  -- Include standalone media
  SELECT m.uid, m.uid as group_id
  FROM media m
  WHERE NOT EXISTS (
    SELECT 1 FROM _mediaHandles mh 
    WHERE mh.A = m.uid OR mh.B = m.uid
  )
),
group_stats AS (
  SELECT group_id, COUNT(*) as group_size
  FROM groups
  GROUP BY group_id
)
SELECT 
  m.*,
  g.group_id,
  gs.group_size,
  CASE 
    WHEN gs.group_size = 1 THEN 'Standalone'
    WHEN gs.group_size <= 5 THEN 'Small Group'
    WHEN gs.group_size <= 20 THEN 'Medium Group'
    ELSE 'Large Group'
  END as group_category
FROM media m
INNER JOIN groups g ON m.uid = g.uid
INNER JOIN group_stats gs ON g.group_id = gs.group_id
ORDER BY gs.group_size DESC, g.group_id, m.uid;