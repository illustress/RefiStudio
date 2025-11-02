import type { ToolResponse } from '@/tools/types'

// Instagram Post Types
export interface InstagramPost {
  id: string
  caption: string
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  mediaUrl?: string
  mediaUrls?: string[]
  permalink: string
  timestamp: string
  username: string
  likeCount?: number
  commentsCount?: number
}

export interface InstagramUser {
  id: string
  username: string
  accountType: 'BUSINESS' | 'CREATOR' | 'PERSONAL'
  followersCount?: number
  followsCount?: number
  mediaCount?: number
}

// Base parameters for Instagram endpoints
export interface InstagramBaseParams {
  accessToken: string
}

// Read/Explain Post Operation
export interface InstagramReadParams extends InstagramBaseParams {
  mediaId: string
  includeInsights?: boolean
}

export interface InstagramReadResponse extends ToolResponse {
  output: {
    post: InstagramPost
    author?: InstagramUser
    explanation?: {
      summary: string
      keyPoints: string[]
      hashtags: string[]
      mentions: string[]
      sentiment?: 'positive' | 'neutral' | 'negative'
    }
  }
}

// Extract Post ID from URL
export interface InstagramExtractParams {
  url: string
}

export interface InstagramExtractResponse extends ToolResponse {
  output: {
    mediaId: string
    shortcode: string
    isValid: boolean
  }
}

export type InstagramResponse = InstagramReadResponse | InstagramExtractResponse
