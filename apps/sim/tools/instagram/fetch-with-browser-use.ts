// Helper script to fetch Instagram post content using Browser Use
// This can be used when Instagram Graph API is not available
// Requires Browser Use API key

import type { BrowserUseRunTaskParams } from '@/tools/browser_use/types'

/**
 * Task description for Browser Use to fetch Instagram post content
 * This instructs the browser automation to navigate to Instagram and extract post information
 */
export const INSTAGRAM_FETCH_TASK = `Navigate to the Instagram post at https://www.instagram.com/p/DQbuQqZDRUB/ and extract the following information:
1. The post caption/text
2. The username of the account that posted it
3. Number of likes (if visible)
4. Number of comments (if visible)
5. Any hashtags in the caption
6. Any user mentions in the caption
7. The type of post (photo, video, or carousel)
8. If it's a carousel, note how many images/videos are in it

Extract this information and return it as structured JSON data.`

/**
 * Example Browser Use task parameters for fetching Instagram post
 */
export const createBrowserUseTask = (apiKey: string): BrowserUseRunTaskParams => ({
  task: INSTAGRAM_FETCH_TASK,
  apiKey,
  model: 'gpt-4o', // Use GPT-4o for better understanding of Instagram's UI
  save_browser_data: false,
})
