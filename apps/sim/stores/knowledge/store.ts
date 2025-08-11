import { create } from 'zustand'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('KnowledgeStore')

export interface ChunkingConfig {
  maxSize: number
  minSize: number
  overlap: number
  chunkSize?: number // Legacy support
  minCharactersPerChunk?: number // Legacy support
  recipe?: string
  lang?: string
  strategy?: 'recursive' | 'semantic' | 'sentence' | 'paragraph'
  [key: string]: unknown
}

export interface KnowledgeBaseData {
  id: string
  name: string
  description?: string
  tokenCount: number
  embeddingModel: string
  embeddingDimension: number
  chunkingConfig: ChunkingConfig
  createdAt: string
  updatedAt: string
  workspaceId?: string
}

export interface DocumentData {
  id: string
  knowledgeBaseId: string
  filename: string
  fileUrl: string
  fileSize: number
  mimeType: string
  chunkCount: number
  tokenCount: number
  characterCount: number
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  processingStartedAt?: string | null
  processingCompletedAt?: string | null
  processingError?: string | null
  enabled: boolean
  uploadedAt: string
  // Document tags
  tag1?: string | null
  tag2?: string | null
  tag3?: string | null
  tag4?: string | null
  tag5?: string | null
  tag6?: string | null
  tag7?: string | null
}

export interface ChunkData {
  id: string
  chunkIndex: number
  content: string
  contentLength: number
  tokenCount: number
  enabled: boolean
  startOffset: number
  endOffset: number
  tag1?: string | null
  tag2?: string | null
  tag3?: string | null
  tag4?: string | null
  tag5?: string | null
  tag6?: string | null
  tag7?: string | null
  createdAt: string
  updatedAt: string
}

export interface NextCursor {
  cursor: string | number
  cursorId: string
}

export interface ChunksPagination {
  total?: number | null // null for non-first pages
  limit: number
  hasMore: boolean
  nextCursor?: NextCursor | null // for cursor-based pagination
}

export interface ChunksCache {
  chunks: ChunkData[]
  pagination: ChunksPagination
  searchQuery?: string
  lastFetchTime: number
}

export interface DocumentsPagination {
  total?: number | null // null for non-first pages
  limit: number
  hasMore: boolean
  nextCursor?: NextCursor | null // for cursor-based pagination
}

export interface DocumentsCache {
  documents: DocumentData[]
  pagination: DocumentsPagination
  searchQuery?: string
  lastFetchTime: number
}

interface KnowledgeStore {
  // State
  knowledgeBases: Record<string, KnowledgeBaseData>
  documents: Record<string, DocumentsCache> // knowledgeBaseId -> documents cache
  chunks: Record<string, ChunksCache> // documentId -> chunks cache
  knowledgeBasesList: KnowledgeBaseData[]

  // Loading states
  loadingKnowledgeBases: Set<string>
  loadingDocuments: Set<string>
  loadingChunks: Set<string>
  loadingKnowledgeBasesList: boolean
  knowledgeBasesListLoaded: boolean

  // Actions
  getKnowledgeBase: (id: string) => Promise<KnowledgeBaseData | null>
  getDocuments: (
    knowledgeBaseId: string,
    options?: { search?: string; limit?: number; cursor?: NextCursor }
  ) => Promise<DocumentData[]>
  getChunks: (
    knowledgeBaseId: string,
    documentId: string,
    options?: { search?: string; limit?: number; cursor?: NextCursor }
  ) => Promise<ChunkData[]>
  getKnowledgeBasesList: (workspaceId?: string) => Promise<KnowledgeBaseData[]>
  refreshDocuments: (
    knowledgeBaseId: string,
    options?: { search?: string; limit?: number }
  ) => Promise<DocumentData[]>
  refreshChunks: (
    knowledgeBaseId: string,
    documentId: string,
    options?: { search?: string; limit?: number }
  ) => Promise<ChunkData[]>
  loadMoreDocuments: (
    knowledgeBaseId: string,
    options?: { search?: string; limit?: number }
  ) => Promise<DocumentData[]>
  loadMoreChunks: (
    knowledgeBaseId: string,
    documentId: string,
    options?: { search?: string; limit?: number }
  ) => Promise<ChunkData[]>
  updateDocument: (
    knowledgeBaseId: string,
    documentId: string,
    updates: Partial<DocumentData>
  ) => void
  updateChunk: (documentId: string, chunkId: string, updates: Partial<ChunkData>) => void
  addPendingDocuments: (knowledgeBaseId: string, documents: DocumentData[]) => void
  addKnowledgeBase: (knowledgeBase: KnowledgeBaseData) => void
  removeKnowledgeBase: (id: string) => void
  removeDocument: (knowledgeBaseId: string, documentId: string) => void
  clearDocuments: (knowledgeBaseId: string) => void
  clearChunks: (documentId: string) => void
  clearKnowledgeBasesList: () => void

  // Getters
  getCachedKnowledgeBase: (id: string) => KnowledgeBaseData | null
  getCachedDocuments: (knowledgeBaseId: string) => DocumentsCache | null
  getCachedChunks: (documentId: string, options?: { search?: string }) => ChunksCache | null

  // Loading state getters
  isKnowledgeBaseLoading: (id: string) => boolean
  isDocumentsLoading: (knowledgeBaseId: string) => boolean
  isChunksLoading: (documentId: string) => boolean
}

export const useKnowledgeStore = create<KnowledgeStore>((set, get) => ({
  knowledgeBases: {},
  documents: {},
  chunks: {},
  knowledgeBasesList: [],
  loadingKnowledgeBases: new Set(),
  loadingDocuments: new Set(),
  loadingChunks: new Set(),
  loadingKnowledgeBasesList: false,
  knowledgeBasesListLoaded: false,

  getCachedKnowledgeBase: (id: string) => {
    return get().knowledgeBases[id] || null
  },

  getCachedDocuments: (knowledgeBaseId: string) => {
    return get().documents[knowledgeBaseId] || null
  },

  getCachedChunks: (documentId: string, options?: { search?: string }) => {
    return get().chunks[documentId] || null
  },

  isKnowledgeBaseLoading: (id: string) => {
    return get().loadingKnowledgeBases.has(id)
  },

  isDocumentsLoading: (knowledgeBaseId: string) => {
    return get().loadingDocuments.has(knowledgeBaseId)
  },

  isChunksLoading: (documentId: string) => {
    return get().loadingChunks.has(documentId)
  },

  getKnowledgeBase: async (id: string) => {
    const state = get()

    // Return cached data if it exists
    const cached = state.knowledgeBases[id]
    if (cached) {
      return cached
    }

    // Return cached data if already loading to prevent duplicate requests
    if (state.loadingKnowledgeBases.has(id)) {
      return null
    }

    try {
      set((state) => ({
        loadingKnowledgeBases: new Set([...state.loadingKnowledgeBases, id]),
      }))

      const response = await fetch(`/api/knowledge/${id}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch knowledge base: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch knowledge base')
      }

      const knowledgeBase = result.data

      set((state) => ({
        knowledgeBases: {
          ...state.knowledgeBases,
          [id]: knowledgeBase,
        },
        loadingKnowledgeBases: new Set(
          [...state.loadingKnowledgeBases].filter((loadingId) => loadingId !== id)
        ),
      }))

      logger.info(`Knowledge base loaded: ${id}`)
      return knowledgeBase
    } catch (error) {
      logger.error(`Error fetching knowledge base ${id}:`, error)

      set((state) => ({
        loadingKnowledgeBases: new Set(
          [...state.loadingKnowledgeBases].filter((loadingId) => loadingId !== id)
        ),
      }))

      throw error
    }
  },

  getDocuments: async (
    knowledgeBaseId: string,
    options?: { search?: string; limit?: number; cursor?: NextCursor }
  ) => {
    const state = get()

    // For cursor pagination, only return cached documents if search hasn't changed
    // and we're not using a cursor (i.e., first page request)
    const cached = state.documents[knowledgeBaseId]
    if (cached && !options?.cursor && cached.searchQuery === options?.search) {
      return cached.documents
    }

    // Return empty array if already loading to prevent duplicate requests
    if (state.loadingDocuments.has(knowledgeBaseId)) {
      return cached?.documents || []
    }

    try {
      set((state) => ({
        loadingDocuments: new Set([...state.loadingDocuments, knowledgeBaseId]),
      }))

      // Build query parameters for cursor pagination
      const params = new URLSearchParams()
      if (options?.search) params.set('search', options.search)
      if (options?.limit) params.set('limit', options.limit.toString())
      if (options?.cursor) {
        params.set('cursor', options.cursor.cursor.toString())
        params.set('cursorId', options.cursor.cursorId)
      }

      const url = `/api/knowledge/${knowledgeBaseId}/documents?${params.toString()}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch documents')
      }

      const documents = result.data.documents
      const pagination = result.data.pagination

      const documentsCache: DocumentsCache = {
        documents,
        pagination,
        searchQuery: options?.search,
        lastFetchTime: Date.now(),
      }

      set((state) => ({
        documents: {
          ...state.documents,
          [knowledgeBaseId]: documentsCache,
        },
        loadingDocuments: new Set(
          [...state.loadingDocuments].filter((loadingId) => loadingId !== knowledgeBaseId)
        ),
      }))

      logger.info(`Documents loaded for knowledge base: ${knowledgeBaseId}`)
      return documents
    } catch (error) {
      logger.error(`Error fetching documents for knowledge base ${knowledgeBaseId}:`, error)

      set((state) => ({
        loadingDocuments: new Set(
          [...state.loadingDocuments].filter((loadingId) => loadingId !== knowledgeBaseId)
        ),
      }))

      throw error
    }
  },

  getChunks: async (
    knowledgeBaseId: string,
    documentId: string,
    options?: { search?: string; limit?: number; cursor?: NextCursor }
  ) => {
    const state = get()

    // For cursor pagination, only return cached chunks if search hasn't changed
    // and we're not using a cursor (i.e., first page request)
    const cached = state.chunks[documentId]
    if (cached && !options?.cursor && cached.searchQuery === options?.search) {
      return cached.chunks
    }

    // Return empty array if already loading to prevent duplicate requests
    if (state.loadingChunks.has(documentId)) {
      return cached?.chunks || []
    }

    try {
      set((state) => ({
        loadingChunks: new Set([...state.loadingChunks, documentId]),
      }))

      // Build query parameters for cursor pagination
      const params = new URLSearchParams()
      if (options?.search) params.set('search', options.search)
      if (options?.limit) params.set('limit', options.limit.toString())
      if (options?.cursor) {
        params.set('cursor', options.cursor.cursor.toString())
        params.set('cursorId', options.cursor.cursorId)
      }

      const response = await fetch(
        `/api/knowledge/${knowledgeBaseId}/documents/${documentId}/chunks?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch chunks: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch chunks')
      }

      const chunks = result.data
      const pagination = result.pagination

      const chunksCache: ChunksCache = {
        chunks,
        pagination,
        searchQuery: options?.search,
        lastFetchTime: Date.now(),
      }

      set((state) => ({
        chunks: {
          ...state.chunks,
          [documentId]: chunksCache,
        },
        loadingChunks: new Set(
          [...state.loadingChunks].filter((loadingId) => loadingId !== documentId)
        ),
      }))

      logger.info(`Chunks loaded for document: ${documentId}`)
      return chunks
    } catch (error) {
      logger.error(`Error fetching chunks for document ${documentId}:`, error)

      set((state) => ({
        loadingChunks: new Set(
          [...state.loadingChunks].filter((loadingId) => loadingId !== documentId)
        ),
      }))

      throw error
    }
  },

  getKnowledgeBasesList: async (workspaceId?: string) => {
    const state = get()

    // Return cached list if we have already loaded it before (prevents infinite loops when empty)
    if (state.knowledgeBasesListLoaded) {
      return state.knowledgeBasesList
    }

    // Return cached data if already loading
    if (state.loadingKnowledgeBasesList) {
      return state.knowledgeBasesList
    }

    // Create an AbortController for request cancellation
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, 10000) // 10 second timeout

    try {
      set({ loadingKnowledgeBasesList: true })

      const url = workspaceId ? `/api/knowledge?workspaceId=${workspaceId}` : '/api/knowledge'
      const response = await fetch(url, {
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Clear the timeout since request completed
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(
          `Failed to fetch knowledge bases: ${response.status} ${response.statusText}`
        )
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch knowledge bases')
      }

      const knowledgeBasesList = result.data || []

      set({
        knowledgeBasesList,
        loadingKnowledgeBasesList: false,
        knowledgeBasesListLoaded: true, // Mark as loaded regardless of result to prevent infinite loops
      })

      logger.info(`Knowledge bases list loaded: ${knowledgeBasesList.length} items`)
      return knowledgeBasesList
    } catch (error) {
      // Clear the timeout in case of error
      clearTimeout(timeoutId)

      logger.error('Error fetching knowledge bases list:', error)

      // Always set loading to false, even on error
      set({
        loadingKnowledgeBasesList: false,
        knowledgeBasesListLoaded: true, // Mark as loaded even on error to prevent infinite retries
      })

      // Don't throw on AbortError (timeout or cancellation)
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('Knowledge bases list request was aborted (timeout or cancellation)')
        return state.knowledgeBasesList // Return whatever we have cached
      }

      throw error
    }
  },

  refreshDocuments: async (
    knowledgeBaseId: string,
    options?: { search?: string; limit?: number }
  ) => {
    const state = get()

    // Return empty array if already loading to prevent duplicate requests
    if (state.loadingDocuments.has(knowledgeBaseId)) {
      return state.documents[knowledgeBaseId]?.documents || []
    }

    try {
      set((state) => ({
        loadingDocuments: new Set([...state.loadingDocuments, knowledgeBaseId]),
      }))

      // Build query parameters - for refresh, don't use cursor (start fresh)
      const params = new URLSearchParams()
      if (options?.search) params.set('search', options.search)
      if (options?.limit) params.set('limit', options.limit.toString())
      // No cursor parameters for refresh - start from beginning

      const url = `/api/knowledge/${knowledgeBaseId}/documents${params.toString() ? `?${params.toString()}` : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch documents')
      }

      const serverDocuments = result.data.documents || result.data
      const pagination = result.data.pagination || {
        total: serverDocuments.length,
        limit: options?.limit || 50,
        hasMore: false,
        nextCursor: null,
      }

      set((state) => {
        const currentDocuments = state.documents[knowledgeBaseId]?.documents || []

        // Create a map of server documents by filename for quick lookup
        const serverDocumentsByFilename = new Map()
        serverDocuments.forEach((doc: DocumentData) => {
          serverDocumentsByFilename.set(doc.filename, doc)
        })

        // Filter out temporary documents that now have real server equivalents
        const filteredCurrentDocs = currentDocuments.filter((doc) => {
          // If this is a temporary document (starts with temp-) and a server document exists with the same filename
          if (doc.id.startsWith('temp-') && serverDocumentsByFilename.has(doc.filename)) {
            return false // Remove the temporary document
          }

          // If this is a real document that still exists on the server, keep it for merging
          if (!doc.id.startsWith('temp-')) {
            const serverDoc = serverDocuments.find((sDoc: DocumentData) => sDoc.id === doc.id)
            if (serverDoc) {
              return false // Will be replaced by server version in merge below
            }
          }

          // Keep temporary documents that don't have server equivalents yet
          return true
        })

        // Merge server documents with any remaining local documents
        const mergedDocuments = serverDocuments.map((serverDoc: DocumentData) => {
          const existingDoc = currentDocuments.find((doc) => doc.id === serverDoc.id)

          if (!existingDoc) {
            // New document from server, use it as-is
            return serverDoc
          }

          // Merge logic for existing documents (prefer server data for most fields)
          return {
            ...existingDoc,
            ...serverDoc,
            // Preserve any local optimistic updates that haven't been reflected on server yet
            ...(existingDoc.processingStatus !== serverDoc.processingStatus &&
            ['pending', 'processing'].includes(existingDoc.processingStatus) &&
            !serverDoc.processingStartedAt
              ? { processingStatus: existingDoc.processingStatus }
              : {}),
          }
        })

        // Add any remaining temporary documents that don't have server equivalents
        const finalDocuments = [...mergedDocuments, ...filteredCurrentDocs]

        const documentsCache: DocumentsCache = {
          documents: finalDocuments,
          pagination,
          searchQuery: options?.search,
          lastFetchTime: Date.now(),
        }

        return {
          documents: {
            ...state.documents,
            [knowledgeBaseId]: documentsCache,
          },
          loadingDocuments: new Set(
            [...state.loadingDocuments].filter((loadingId) => loadingId !== knowledgeBaseId)
          ),
        }
      })

      logger.info(`Documents refreshed for knowledge base: ${knowledgeBaseId}`)
      return serverDocuments
    } catch (error) {
      logger.error(`Error refreshing documents for knowledge base ${knowledgeBaseId}:`, error)

      set((state) => ({
        loadingDocuments: new Set(
          [...state.loadingDocuments].filter((loadingId) => loadingId !== knowledgeBaseId)
        ),
      }))

      throw error
    }
  },

  refreshChunks: async (
    knowledgeBaseId: string,
    documentId: string,
    options?: { search?: string; limit?: number }
  ) => {
    const state = get()

    // Return cached chunks if already loading to prevent duplicate requests
    if (state.loadingChunks.has(documentId)) {
      return state.chunks[documentId]?.chunks || []
    }

    try {
      set((state) => ({
        loadingChunks: new Set([...state.loadingChunks, documentId]),
      }))

      // Build query parameters - for refresh, don't use cursor (start fresh)
      const params = new URLSearchParams()
      if (options?.search) params.set('search', options.search)
      if (options?.limit) params.set('limit', options.limit.toString())
      // No cursor parameters for refresh - start from beginning

      const response = await fetch(
        `/api/knowledge/${knowledgeBaseId}/documents/${documentId}/chunks?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch chunks: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch chunks')
      }

      const chunks = result.data
      const pagination = result.pagination

      const chunksCache: ChunksCache = {
        chunks, // Replace all chunks with fresh data
        pagination,
        searchQuery: options?.search,
        lastFetchTime: Date.now(),
      }

      set((state) => ({
        chunks: {
          ...state.chunks,
          [documentId]: chunksCache,
        },
        loadingChunks: new Set(
          [...state.loadingChunks].filter((loadingId) => loadingId !== documentId)
        ),
      }))

      logger.info(`Chunks refreshed for document: ${documentId}`)
      return chunks
    } catch (error) {
      logger.error(`Error refreshing chunks for document ${documentId}:`, error)

      set((state) => ({
        loadingChunks: new Set(
          [...state.loadingChunks].filter((loadingId) => loadingId !== documentId)
        ),
      }))

      throw error
    }
  },

  loadMoreDocuments: async (
    knowledgeBaseId: string,
    options?: { search?: string; limit?: number }
  ) => {
    const state = get()
    const cached = state.documents[knowledgeBaseId]

    // Only load more if we have cached data and there are more results
    if (!cached || !cached.pagination.hasMore || !cached.pagination.nextCursor) {
      return cached?.documents || []
    }

    try {
      // Use the existing getDocuments method with the cursor
      const moreDocuments = await get().getDocuments(knowledgeBaseId, {
        search: options?.search || cached.searchQuery,
        limit: options?.limit || cached.pagination.limit,
        cursor: cached.pagination.nextCursor,
      })

      // Get the updated pagination from the API response
      const updatedCache = get().documents[knowledgeBaseId]

      // Append to existing documents and update pagination
      set((state) => {
        const currentCache = state.documents[knowledgeBaseId]
        if (!currentCache) return state

        return {
          documents: {
            ...state.documents,
            [knowledgeBaseId]: {
              ...currentCache,
              documents: [...currentCache.documents, ...moreDocuments],
              // Update pagination to reflect the new cursor state
              pagination: updatedCache?.pagination || currentCache.pagination,
            },
          },
        }
      })

      return moreDocuments
    } catch (error) {
      logger.error(`Error loading more documents for knowledge base ${knowledgeBaseId}:`, error)
      throw error
    }
  },

  loadMoreChunks: async (
    knowledgeBaseId: string,
    documentId: string,
    options?: { search?: string; limit?: number }
  ) => {
    const state = get()
    const cached = state.chunks[documentId]

    // Only load more if we have cached data and there are more results
    if (!cached || !cached.pagination.hasMore || !cached.pagination.nextCursor) {
      return cached?.chunks || []
    }

    try {
      // Use the existing getChunks method with the cursor
      const moreChunks = await get().getChunks(knowledgeBaseId, documentId, {
        search: options?.search || cached.searchQuery,
        limit: options?.limit || cached.pagination.limit,
        cursor: cached.pagination.nextCursor,
      })

      // Get the updated pagination from the API response
      const updatedCache = get().chunks[documentId]

      // Append to existing chunks and update pagination
      set((state) => {
        const currentCache = state.chunks[documentId]
        if (!currentCache) return state

        return {
          chunks: {
            ...state.chunks,
            [documentId]: {
              ...currentCache,
              chunks: [...currentCache.chunks, ...moreChunks],
              // Update pagination to reflect the new cursor state
              pagination: updatedCache?.pagination || currentCache.pagination,
            },
          },
        }
      })

      return moreChunks
    } catch (error) {
      logger.error(`Error loading more chunks for document ${documentId}:`, error)
      throw error
    }
  },

  updateDocument: (knowledgeBaseId: string, documentId: string, updates: Partial<DocumentData>) => {
    set((state) => {
      const documentsCache = state.documents[knowledgeBaseId]
      if (!documentsCache) return state

      const updatedDocuments = documentsCache.documents.map((doc) =>
        doc.id === documentId ? { ...doc, ...updates } : doc
      )

      return {
        documents: {
          ...state.documents,
          [knowledgeBaseId]: {
            ...documentsCache,
            documents: updatedDocuments,
          },
        },
      }
    })
  },

  updateChunk: (documentId: string, chunkId: string, updates: Partial<ChunkData>) => {
    set((state) => {
      const cachedChunks = state.chunks[documentId]
      if (!cachedChunks || !cachedChunks.chunks) return state

      const updatedChunks = cachedChunks.chunks.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, ...updates } : chunk
      )

      return {
        chunks: {
          ...state.chunks,
          [documentId]: {
            ...cachedChunks,
            chunks: updatedChunks,
          },
        },
      }
    })
  },

  addPendingDocuments: (knowledgeBaseId: string, newDocuments: DocumentData[]) => {
    set((state) => {
      const existingDocumentsCache = state.documents[knowledgeBaseId]
      const existingDocuments = existingDocumentsCache?.documents || []

      const existingIds = new Set(existingDocuments.map((doc) => doc.id))
      const uniqueNewDocuments = newDocuments.filter((doc) => !existingIds.has(doc.id))

      if (uniqueNewDocuments.length === 0) {
        logger.warn(`No new documents to add - all ${newDocuments.length} documents already exist`)
        return state
      }

      const updatedDocuments = [...existingDocuments, ...uniqueNewDocuments]

      const documentsCache: DocumentsCache = {
        documents: updatedDocuments,
        pagination: {
          ...(existingDocumentsCache?.pagination || {
            limit: 50,
            hasMore: false,
            nextCursor: null,
          }),
          total: updatedDocuments.length,
        },
        searchQuery: existingDocumentsCache?.searchQuery,
        lastFetchTime: Date.now(),
      }

      return {
        documents: {
          ...state.documents,
          [knowledgeBaseId]: documentsCache,
        },
      }
    })
    logger.info(
      `Added ${newDocuments.filter((doc) => !get().documents[knowledgeBaseId]?.documents?.some((existing) => existing.id === doc.id)).length} pending documents for knowledge base: ${knowledgeBaseId}`
    )
  },

  addKnowledgeBase: (knowledgeBase: KnowledgeBaseData) => {
    set((state) => ({
      knowledgeBases: {
        ...state.knowledgeBases,
        [knowledgeBase.id]: knowledgeBase,
      },
      knowledgeBasesList: [knowledgeBase, ...state.knowledgeBasesList],
    }))
    logger.info(`Knowledge base added: ${knowledgeBase.id}`)
  },

  removeKnowledgeBase: (id: string) => {
    set((state) => {
      const newKnowledgeBases = { ...state.knowledgeBases }
      delete newKnowledgeBases[id]

      const newDocuments = { ...state.documents }
      delete newDocuments[id]

      return {
        knowledgeBases: newKnowledgeBases,
        documents: newDocuments,
        knowledgeBasesList: state.knowledgeBasesList.filter((kb) => kb.id !== id),
      }
    })
    logger.info(`Knowledge base removed: ${id}`)
  },

  removeDocument: (knowledgeBaseId: string, documentId: string) => {
    set((state) => {
      const documentsCache = state.documents[knowledgeBaseId]
      if (!documentsCache) return state

      const updatedDocuments = documentsCache.documents.filter((doc) => doc.id !== documentId)

      // Also clear chunks for the removed document
      const newChunks = { ...state.chunks }
      delete newChunks[documentId]

      return {
        documents: {
          ...state.documents,
          [knowledgeBaseId]: {
            ...documentsCache,
            documents: updatedDocuments,
          },
        },
        chunks: newChunks,
      }
    })
    logger.info(`Document removed from knowledge base: ${documentId}`)
  },

  clearDocuments: (knowledgeBaseId: string) => {
    set((state) => {
      const newDocuments = { ...state.documents }
      delete newDocuments[knowledgeBaseId]
      return { documents: newDocuments }
    })
    logger.info(`Documents cleared for knowledge base: ${knowledgeBaseId}`)
  },

  clearChunks: (documentId: string) => {
    set((state) => {
      const newChunks = { ...state.chunks }
      delete newChunks[documentId]
      return { chunks: newChunks }
    })
    logger.info(`Chunks cleared for document: ${documentId}`)
  },

  clearKnowledgeBasesList: () => {
    set({
      knowledgeBasesList: [],
      knowledgeBasesListLoaded: false, // Reset loaded state to allow reloading
    })
    logger.info('Knowledge bases list cleared')
  },
}))
