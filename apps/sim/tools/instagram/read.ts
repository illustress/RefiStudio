import type { ToolConfig } from '@/tools/types'
import type { InstagramReadParams, InstagramReadResponse, InstagramPost, InstagramUser } from '@/tools/instagram/types'

// This tool fetches Instagram post data and provides explanations
// Note: Requires Instagram Graph API access with proper OAuth permissions
// Instagram Business or Creator account required for API access
export const instagramReadTool: ToolConfig<InstagramReadParams, InstagramReadResponse> = {
  id: 'instagram_read',
  name: 'Instagram Read',
  description: 'Read Instagram post details and generate explanations of the content, including caption analysis, hashtags, mentions, and engagement metrics',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'instagram',
    additionalScopes: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'],
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'Instagram OAuth access token',
    },
    mediaId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Instagram media ID or shortcode (e.g., DQbuQqZDRUB)',
    },
    includeInsights: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Whether to include engagement insights and metrics',
    },
  },

  request: {
    // Step 1: Build API URL with media ID and fields
    url: (params) => {
      const fields = [
        'id',
        'caption',
        'media_type',
        'media_url',
        'permalink',
        'timestamp',
        'username',
        'like_count',
        'comments_count',
      ].join(',')

      // Step 2: Handle both media ID and shortcode formats
      // If it's a shortcode (like DQbuQqZDRUB), we may need to convert it
      // Instagram Graph API uses numeric IDs, but we can try shortcode first
      // Note: For shortcodes, you may need to use Instagram Basic Display API or
      // convert shortcode to media ID first using: https://api.instagram.com/oembed/?url=https://www.instagram.com/p/{shortcode}/
      const mediaId = params.mediaId

      return `https://graph.instagram.com/${mediaId}?fields=${fields}&access_token=${params.accessToken}`
    },
    method: 'GET',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
  },

  transformResponse: async (response) => {
    const data = await response.json()

    // Step 3: Transform Instagram API response to our format
    const transformPost = (post: any): InstagramPost => {
      const mediaUrls = post.media_type === 'CAROUSEL_ALBUM' 
        ? (post.children?.data?.map((child: any) => child.media_url) || [post.media_url])
        : undefined

      return {
        id: post.id,
        caption: post.caption || '',
        mediaType: post.media_type || 'IMAGE',
        mediaUrl: post.media_url,
        mediaUrls,
        permalink: post.permalink,
        timestamp: post.timestamp,
        username: post.username,
        likeCount: post.like_count,
        commentsCount: post.comments_count,
      }
    }

    const post = transformPost(data)

    // Step 4: Extract author information if available
    let author: InstagramUser | undefined
    if (data.owner) {
      author = {
        id: data.owner.id,
        username: data.owner.username || post.username,
        accountType: data.owner.account_type || 'PERSONAL',
        followersCount: data.owner.followers_count,
        followsCount: data.owner.follows_count,
        mediaCount: data.owner.media_count,
      }
    }

    // Step 5: Generate explanation from caption and metadata
    const caption = post.caption || ''
    const hashtags = (caption.match(/#[\w]+/g) || []).map(tag => tag.substring(1))
    const mentions = (caption.match(/@[\w]+/g) || []).map(mention => mention.substring(1))

    // Step 6: Basic sentiment analysis (simple keyword-based)
    // Note: For production, consider using a proper sentiment analysis service
    const positiveKeywords = ['love', 'amazing', 'great', 'beautiful', 'wonderful', 'happy', 'best', 'awesome', 'perfect']
    const negativeKeywords = ['hate', 'terrible', 'bad', 'worst', 'sad', 'disappointed', 'awful']
    
    const lowerCaption = caption.toLowerCase()
    const positiveCount = positiveKeywords.filter(keyword => lowerCaption.includes(keyword)).length
    const negativeCount = negativeKeywords.filter(keyword => lowerCaption.includes(keyword)).length
    
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
    if (positiveCount > negativeCount) {
      sentiment = 'positive'
    } else if (negativeCount > positiveCount) {
      sentiment = 'negative'
    }

    // Step 7: Extract key points from caption (first 3 sentences or bullet points)
    const sentences = caption.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const keyPoints = sentences.slice(0, 3).map(s => s.trim())

    // Step 8: Generate summary
    const summary = caption.length > 200 
      ? `${caption.substring(0, 200)}...`
      : caption || 'No caption available'

    return {
      success: true,
      output: {
        post,
        author,
        explanation: {
          summary,
          keyPoints,
          hashtags,
          mentions,
          sentiment,
        },
      },
    }
  },

  outputs: {
    post: {
      type: 'object',
      description: 'The Instagram post data including caption, media URLs, and engagement metrics',
      properties: {
        id: { type: 'string', description: 'Instagram post ID' },
        caption: { type: 'string', description: 'Post caption text' },
        mediaType: { type: 'string', description: 'Type of media: IMAGE, VIDEO, or CAROUSEL_ALBUM' },
        mediaUrl: { type: 'string', description: 'URL to the media content' },
        permalink: { type: 'string', description: 'Permalink to the Instagram post' },
        timestamp: { type: 'string', description: 'Post creation timestamp' },
        username: { type: 'string', description: 'Username of the post author' },
      },
    },
    author: {
      type: 'object',
      description: 'Information about the post author',
      optional: true,
    },
    explanation: {
      type: 'object',
      description: 'Explanation and analysis of the post content including summary, key points, hashtags, mentions, and sentiment',
      optional: true,
      properties: {
        summary: { type: 'string', description: 'Summary of the post content' },
        keyPoints: { type: 'array', description: 'Key points extracted from the caption' },
        hashtags: { type: 'array', description: 'List of hashtags used in the post' },
        mentions: { type: 'array', description: 'List of user mentions in the post' },
        sentiment: { type: 'string', description: 'Sentiment analysis: positive, neutral, or negative' },
      },
    },
  },
}
