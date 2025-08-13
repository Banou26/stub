-- Group all Media items in the database by their relationships
-- This query identifies connected components of related media items
-- Each group represents a set of media items that are all related to each other

WITH RECURSIVE media_groups AS (
  -- Base case: Start with all media items as their own root
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    m.uid as group_root,
    0 as depth
  FROM media m
  WHERE NOT EXISTS (
    -- Start only with media that aren't already handled by another media with a "smaller" uid
    SELECT 1 
    FROM _mediaHandles mh 
    WHERE (mh.B = m.uid AND mh.A < m.uid) 
       OR (mh.A = m.uid AND mh.B < m.uid)
  )
  
  UNION
  
  -- Recursive case: Find all related media
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    mg.group_root,
    mg.depth + 1
  FROM media m
  INNER JOIN _mediaHandles mh ON (m.uid = mh.B OR m.uid = mh.A)
  INNER JOIN media_groups mg ON (
    (mg.uid = mh.A AND m.uid = mh.B) OR 
    (mg.uid = mh.B AND m.uid = mh.A)
  )
  WHERE mg.depth < 50  -- Prevent infinite recursion
),
-- Get the minimum group root for each media item (to handle items that might be reached from multiple roots)
normalized_groups AS (
  SELECT 
    uid,
    title,
    origin,
    id,
    language,
    MIN(group_root) as final_group_root
  FROM media_groups
  GROUP BY uid, title, origin, id, language
),
-- Add standalone media items that have no relationships
all_media_with_groups AS (
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    COALESCE(ng.final_group_root, m.uid) as group_id
  FROM media m
  LEFT JOIN normalized_groups ng ON m.uid = ng.uid
)
-- Final result: Group all media by their relationship group
SELECT 
  group_id,
  COUNT(*) as group_size,
  GROUP_CONCAT(uid, ', ') as media_uids,
  GROUP_CONCAT(title, ' | ') as media_titles
FROM all_media_with_groups
GROUP BY group_id
ORDER BY group_size DESC, group_id;