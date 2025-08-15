-- Recursively get all related Media handles
-- Replace :mediaUri with the actual UID parameter

WITH RECURSIVE related AS (
  -- Start with the requested media
  SELECT m.*, 0 as depth
  FROM media m
  WHERE m.uri = :mediaUri

  UNION

  -- Find connected media (both directions)
  SELECT m.*, r.depth + 1
  FROM media m
  INNER JOIN _mediaHandles mh ON (m.uri = mh.A OR m.uri = mh.B)
  INNER JOIN related r ON (
    (r.uri = mh.A AND m.uri = mh.B) OR
    (r.uri = mh.B AND m.uri = mh.A)
  )
  WHERE r.depth < 10  -- Prevent infinite recursion
)
SELECT DISTINCT * FROM (
  SELECT * FROM related
) ORDER BY uri;
