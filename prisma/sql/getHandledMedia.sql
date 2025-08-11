-- @param {String} $1:mediaId
-- Get all media that a specific media handles
SELECT m.* 
FROM media m
INNER JOIN _MediaHandles mh ON m.id = mh.B
WHERE mh.A = $1