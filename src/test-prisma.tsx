import React, { useState, useEffect } from 'react'
import { 
  getPrismaClient, 
  createMedia, 
  addHandle, 
  getDirectHandles,
  generateId
} from './worker/database/prisma-client-proxy'

export function PrismaTestComponent() {
  const [status, setStatus] = useState<string>('Initializing...')
  const [media, setMedia] = useState<any[]>([])
  const [relatedMedia, setRelatedMedia] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  const initializePrisma = async () => {
    try {
      setStatus('Initializing Prisma with wa-sqlite...')
      const prisma = await getPrismaClient('test-prisma-db')
      setStatus('Prisma initialized successfully!')
      
      // Load existing media
      const allMedia = await prisma.media.findMany()
      setMedia(allMedia)
    } catch (err) {
      console.error('Initialization error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('Failed to initialize')
    }
  }

  const createTestData = async () => {
    try {
      setStatus('Creating test data...')
      
      // Create some test media
      const id1 = generateId()
      const id2 = generateId()
      const id3 = generateId()
      
      await createMedia(id1, 'Video File 1')
      await createMedia(id2, 'Audio Track 1')
      await createMedia(id3, 'Subtitle File 1')
      
      // Create relationships
      await addHandle(id1, id2) // Video handles Audio
      await addHandle(id1, id3) // Video handles Subtitle
      
      setStatus('Test data created!')
      
      // Reload media
      const prisma = await getPrismaClient()
      const allMedia = await prisma.media.findMany()
      setMedia(allMedia)
    } catch (err) {
      console.error('Error creating test data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const testQueries = async () => {
    try {
      if (media.length === 0) {
        setStatus('No media to test with. Create test data first.')
        return
      }
      
      setStatus('Testing queries...')
      
      const firstMedia = media[0]
      
      // Test direct handles
      const handles = await getDirectHandles(firstMedia.id)
      console.log('Direct handles:', handles)
      
      // Test recursive query using raw SQL
      const prisma = await getPrismaClient()
      const allRelated = await prisma.$queryRaw`
        WITH RECURSIVE related_media AS (
          SELECT id, name FROM media WHERE id = ${firstMedia.id}
          UNION
          SELECT DISTINCT m.id, m.name
          FROM media m
          INNER JOIN media_handles mh ON m.id = mh.handles_id
          INNER JOIN related_media rm ON mh.media_id = rm.id
        )
        SELECT DISTINCT * FROM related_media
      `
      console.log('All related media:', allRelated)
      setRelatedMedia(allRelated as any[])
      
      setStatus('Queries executed successfully!')
    } catch (err) {
      console.error('Query error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const clearDatabase = async () => {
    try {
      setStatus('Clearing database...')
      const prisma = await getPrismaClient()
      
      // Delete all media handles first (due to foreign keys)
      await prisma.mediaHandle.deleteMany()
      
      // Then delete all media
      await prisma.media.deleteMany()
      
      setMedia([])
      setRelatedMedia([])
      setStatus('Database cleared!')
    } catch (err) {
      console.error('Error clearing database:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    initializePrisma()
  }, [])

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Prisma + wa-sqlite Browser Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <strong>Status:</strong> {status}
      </div>
      
      {error && (
        <div style={{ color: 'red', marginBottom: '20px' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={initializePrisma} style={{ marginRight: '10px' }}>
          Re-initialize Prisma
        </button>
        <button onClick={createTestData} style={{ marginRight: '10px' }}>
          Create Test Data
        </button>
        <button onClick={testQueries} style={{ marginRight: '10px' }}>
          Test Queries
        </button>
        <button onClick={clearDatabase}>
          Clear Database
        </button>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Media ({media.length} items)</h3>
        <pre style={{ background: '#f0f0f0', padding: '10px', overflow: 'auto' }}>
          {JSON.stringify(media, null, 2)}
        </pre>
      </div>
      
      {relatedMedia.length > 0 && (
        <div>
          <h3>Related Media Query Result</h3>
          <pre style={{ background: '#f0f0f0', padding: '10px', overflow: 'auto' }}>
            {JSON.stringify(relatedMedia, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default PrismaTestComponent