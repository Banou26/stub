-- @param {String} $1:mediaId
-- Get all media that handle a specific media
SELECT m.* 
FROM media m
INNER JOIN _MediaHandles mh ON m.id = mh.A
WHERE mh.B = $1