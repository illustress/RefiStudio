import { useCallback, useEffect, useState } from 'react'
import { type ChunkData, type DocumentData, useKnowledgeStore } from '@/stores/knowledge/store'

export function useKnowledgeBase(id: string) {
  const { getKnowledgeBase, getCachedKnowledgeBase, loadingKnowledgeBases } = useKnowledgeStore()

  const [error, setError] = useState<string | null>(null)

  const knowledgeBase = getCachedKnowledgeBase(id)
  const isLoading = loadingKnowledgeBases.has(id)

  useEffect(() => {
    if (!id || knowledgeBase || isLoading) return

    let isMounted = true

    const loadData = async () => {
      try {
        setError(null)
        await getKnowledgeBase(id)
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load knowledge base')
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [id, knowledgeBase, isLoading])

  return {
    knowledgeBase,
    isLoading,
    error,
  }
}

// Constants
const DEFAULT_PAGE_SIZE = 50

export function useKnowledgeBaseDocuments(
  knowledgeBaseId: string,
  options?: { search?: string; limit?: number }
) {
  const {
    getDocuments,
    getCachedDocuments,
    loadingDocuments,
    updateDocument,
    refreshDocuments,
    loadMoreDocuments,
  } = useKnowledgeStore()

  const [error, setError] = useState<string | null>(null)
  const [lastSearch, setLastSearch] = useState<string | undefined>(options?.search)

  const documentsCache = getCachedDocuments(knowledgeBaseId)
  const allDocuments = documentsCache?.documents || []
  const cachePagination = documentsCache?.pagination || {
    total: null,
    limit: DEFAULT_PAGE_SIZE,
    hasMore: false,
    nextCursor: null,
  }
  const isLoading = loadingDocuments.has(knowledgeBaseId)

  // Virtual pagination: present cursor-based data as traditional pages
  const limit = options?.limit || DEFAULT_PAGE_SIZE

  const pagination = {
    total: cachePagination.total,
    limit,
    hasMore: cachePagination.hasMore,
    nextCursor: cachePagination.nextCursor,
  }

  // Return all loaded documents (will be sliced by the component based on currentPage)
  const documents = allDocuments

  // Load first page when knowledgeBaseId changes or search changes
  useEffect(() => {
    if (!knowledgeBaseId) return

    // If search query changed, load fresh data
    if (lastSearch !== options?.search) {
      setLastSearch(options?.search)
      let isMounted = true

      const loadData = async () => {
        try {
          setError(null)
          await getDocuments(knowledgeBaseId, {
            search: options?.search,
            // For search queries, load ALL results (no limit for comprehensive search)
            // For browsing, use normal page size
            limit: options?.search ? undefined : options?.limit || DEFAULT_PAGE_SIZE,
          })
        } catch (err) {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Failed to load documents')
          }
        }
      }

      loadData()

      return () => {
        isMounted = false
      }
    }

    // Load initial data if no cache exists
    if (!documentsCache && !isLoading) {
      let isMounted = true

      const loadData = async () => {
        try {
          setError(null)
          await getDocuments(knowledgeBaseId, {
            search: options?.search,
            // For search queries, load ALL results (no limit for comprehensive search)
            // For browsing, use normal page size
            limit: options?.search ? undefined : options?.limit || DEFAULT_PAGE_SIZE,
          })
        } catch (err) {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Failed to load documents')
          }
        }
      }

      loadData()

      return () => {
        isMounted = false
      }
    }
  }, [
    knowledgeBaseId,
    options?.search,
    options?.limit,
    documentsCache,
    isLoading,
    getDocuments,
    lastSearch,
  ])

  const refreshDocumentsData = useCallback(async () => {
    try {
      setError(null)
      await refreshDocuments(knowledgeBaseId, {
        search: options?.search,
        // For search queries, load ALL results (no limit for comprehensive search)
        limit: options?.search ? undefined : options?.limit || DEFAULT_PAGE_SIZE,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh documents')
    }
  }, [knowledgeBaseId, refreshDocuments, options?.search, options?.limit])

  const loadMoreDocumentsData = useCallback(async () => {
    try {
      setError(null)
      await loadMoreDocuments(knowledgeBaseId, {
        search: options?.search,
        limit: options?.limit || DEFAULT_PAGE_SIZE,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more documents')
    }
  }, [knowledgeBaseId, loadMoreDocuments, options?.search, options?.limit])

  const updateDocumentLocal = useCallback(
    (documentId: string, updates: Partial<DocumentData>) => {
      updateDocument(knowledgeBaseId, documentId, updates)
    },
    [knowledgeBaseId, updateDocument]
  )

  return {
    documents,
    pagination,
    isLoading,
    error,
    refreshDocuments: refreshDocumentsData,
    loadMoreDocuments: loadMoreDocumentsData,
    updateDocument: updateDocumentLocal,
  }
}

export function useDocumentChunks(
  knowledgeBaseId: string,
  documentId: string,
  options?: { search?: string; limit?: number }
) {
  const { getChunks, getCachedChunks, loadingChunks, updateChunk, refreshChunks, loadMoreChunks } =
    useKnowledgeStore()

  const [error, setError] = useState<string | null>(null)
  const [lastSearch, setLastSearch] = useState<string | undefined>(options?.search)

  const chunksCache = getCachedChunks(documentId)
  const allChunks = chunksCache?.chunks || []
  const cachePagination = chunksCache?.pagination || {
    total: null,
    limit: DEFAULT_PAGE_SIZE,
    hasMore: false,
    nextCursor: null,
  }
  const isLoading = loadingChunks.has(documentId)

  // Virtual pagination: present cursor-based data as traditional pages
  const limit = options?.limit || DEFAULT_PAGE_SIZE

  const pagination = {
    total: cachePagination.total,
    limit,
    hasMore: cachePagination.hasMore,
    nextCursor: cachePagination.nextCursor,
  }

  // Return all loaded chunks (will be sliced by the component based on currentPage)
  const chunks = allChunks

  // Load first page when documentId changes or search changes
  useEffect(() => {
    if (!knowledgeBaseId || !documentId) return

    // If search query changed, load fresh data
    if (lastSearch !== options?.search) {
      setLastSearch(options?.search)
      let isMounted = true

      const loadData = async () => {
        try {
          setError(null)
          await getChunks(knowledgeBaseId, documentId, {
            search: options?.search,
            // For search queries, load ALL results (no limit for comprehensive search)
            // For browsing, use normal page size
            limit: options?.search ? undefined : options?.limit || DEFAULT_PAGE_SIZE,
          })
        } catch (err) {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Failed to load chunks')
          }
        }
      }

      loadData()

      return () => {
        isMounted = false
      }
    }

    // Load initial data if no cache exists
    if (!chunksCache && !isLoading) {
      let isMounted = true

      const loadData = async () => {
        try {
          setError(null)
          await getChunks(knowledgeBaseId, documentId, {
            search: options?.search,
            // For search queries, load ALL results (no limit for comprehensive search)
            // For browsing, use normal page size
            limit: options?.search ? undefined : options?.limit || DEFAULT_PAGE_SIZE,
          })
        } catch (err) {
          if (isMounted) {
            setError(err instanceof Error ? err.message : 'Failed to load chunks')
          }
        }
      }

      loadData()

      return () => {
        isMounted = false
      }
    }
  }, [
    knowledgeBaseId,
    documentId,
    options?.search,
    options?.limit,
    chunksCache,
    isLoading,
    getChunks,
    lastSearch,
  ])

  const refreshChunksData = useCallback(async () => {
    try {
      setError(null)
      await refreshChunks(knowledgeBaseId, documentId, {
        search: options?.search,
        // For search queries, load ALL results (no limit for comprehensive search)
        limit: options?.search ? undefined : options?.limit || DEFAULT_PAGE_SIZE,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh chunks')
    }
  }, [knowledgeBaseId, documentId, refreshChunks, options?.search, options?.limit])

  const loadMoreChunksData = useCallback(async () => {
    try {
      setError(null)
      await loadMoreChunks(knowledgeBaseId, documentId, {
        search: options?.search,
        limit: options?.limit || DEFAULT_PAGE_SIZE,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more chunks')
    }
  }, [knowledgeBaseId, documentId, loadMoreChunks, options?.search, options?.limit])

  const updateChunkLocal = useCallback(
    (chunkId: string, updates: Partial<ChunkData>) => {
      updateChunk(documentId, chunkId, updates)
    },
    [documentId, updateChunk]
  )

  return {
    chunks,
    pagination,
    isLoading,
    error,
    refreshChunks: refreshChunksData,
    loadMoreChunks: loadMoreChunksData,
    updateChunk: updateChunkLocal,
  }
}

export function useKnowledgeBasesList(workspaceId?: string) {
  const {
    getKnowledgeBasesList,
    knowledgeBasesList,
    loadingKnowledgeBasesList,
    knowledgeBasesListLoaded,
    addKnowledgeBase,
    removeKnowledgeBase,
    clearKnowledgeBasesList,
  } = useKnowledgeStore()

  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  useEffect(() => {
    // Only load if we haven't loaded before AND we're not currently loading
    if (knowledgeBasesListLoaded || loadingKnowledgeBasesList) return

    let isMounted = true
    let retryTimeoutId: NodeJS.Timeout | null = null

    const loadData = async (attempt = 0) => {
      // Don't proceed if component is unmounted
      if (!isMounted) return

      try {
        setError(null)
        await getKnowledgeBasesList(workspaceId)

        // Reset retry count on success
        if (isMounted) {
          setRetryCount(0)
        }
      } catch (err) {
        if (!isMounted) return

        const errorMessage = err instanceof Error ? err.message : 'Failed to load knowledge bases'

        // Only set error and retry if we haven't exceeded max retries
        if (attempt < maxRetries) {
          console.warn(`Knowledge bases load attempt ${attempt + 1} failed, retrying...`, err)

          if (isMounted) {
            setRetryCount(attempt + 1)
          }

          // Exponential backoff: 1s, 2s, 4s
          const delay = 2 ** attempt * 1000

          retryTimeoutId = setTimeout(() => {
            if (isMounted) {
              loadData(attempt + 1)
            }
          }, delay)
        } else {
          // Max retries reached
          console.error('Max retries reached for knowledge bases load:', err)
          if (isMounted) {
            setError(errorMessage)
            setRetryCount(maxRetries)
          }
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId)
      }
    }
  }, [workspaceId, knowledgeBasesListLoaded, loadingKnowledgeBasesList, getKnowledgeBasesList])

  const refreshKnowledgeBasesList = useCallback(async () => {
    try {
      setError(null)
      setRetryCount(0)
      await getKnowledgeBasesList(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh knowledge bases list')
    }
  }, [workspaceId, getKnowledgeBasesList])

  return {
    knowledgeBasesList,
    isLoading: loadingKnowledgeBasesList,
    error,
    retryCount,
    maxRetries,
    refreshKnowledgeBasesList,
    addKnowledgeBase,
    removeKnowledgeBase,
    clearKnowledgeBasesList,
  }
}
