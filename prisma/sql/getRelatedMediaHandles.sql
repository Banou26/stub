-- Recursively get all Media handles related to a specific Media item
-- This query traverses the handles relationship in both directions
-- Usage: Replace :mediaUid with the actual UID of the media you want to query

WITH RECURSIVE related_media AS (
  -- Base case: Start with the specified media
  SELECT 
    uid,
    title,
    origin,
    id,
    language,
    0 as depth,
    uid as root_uid
  FROM media
  WHERE uid = :mediaUid
  
  UNION
  
  -- Recursive case: Find all media related through handles (forward direction)
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    rm.depth + 1,
    rm.root_uid
  FROM media m
  INNER JOIN _mediaHandles mh ON m.uid = mh.B
  INNER JOIN related_media rm ON rm.uid = mh.A
  WHERE rm.depth < 10  -- Prevent infinite recursion, adjust depth as needed
  
  UNION
  
  -- Recursive case: Find all media related through handleOf (reverse direction)
  SELECT 
    m.uid,
    m.title,
    m.origin,
    m.id,
    m.language,
    rm.depth + 1,
    rm.root_uid
  FROM media m
  INNER JOIN _mediaHandles mh ON m.uid = mh.A
  INNER JOIN related_media rm ON rm.uid = mh.B
  WHERE rm.depth < 10  -- Prevent infinite recursion, adjust depth as needed
)
SELECT DISTINCT
  uid,
  title,
  origin,
  id,
  language,
  MIN(depth) as min_depth
FROM related_media
GROUP BY uid, title, origin, id, language
ORDER BY min_depth, title;