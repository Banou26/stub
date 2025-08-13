-- Recursively get all related Media handles
-- Replace :mediaUid with the actual UID parameter

WITH RECURSIVE related AS (
  -- Start with the requested media
  SELECT m.*, 0 as depth
  FROM media m
  WHERE m.uid = :mediaUid
  
  UNION
  
  -- Find connected media (both directions)
  SELECT m.*, r.depth + 1
  FROM media m
  INNER JOIN _mediaHandles mh ON (m.uid = mh.A OR m.uid = mh.B)
  INNER JOIN related r ON (
    (r.uid = mh.A AND m.uid = mh.B) OR 
    (r.uid = mh.B AND m.uid = mh.A)
  )
  WHERE r.depth < 10  -- Prevent infinite recursion
)
SELECT DISTINCT * FROM (
  SELECT uid, origin, id, url, language, title, type, status, 
         shortDescription, description, externalLinks, averageScore, 
         popularity, initialReleaseDate, startDate, endDate, 
         isAdult, episodeCount
  FROM related
) ORDER BY uid;