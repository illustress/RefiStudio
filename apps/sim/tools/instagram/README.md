# Instagram Tools

Tools for fetching and explaining Instagram post content.

## Available Tools

### `instagram_read`

Fetches Instagram post data using the Instagram Graph API and generates explanations.

**Requirements:**
- Instagram Business or Creator account
- Facebook App with Instagram Graph API access
- OAuth access token with required scopes

## Alternative Methods

If Instagram Graph API is not available, you can use these alternative tools:

### Option 1: Browser Use (Recommended for JavaScript-heavy pages)

Use the `browser_use_run_task` tool to navigate to Instagram and extract content:

```typescript
{
  tool: "browser_use_run_task",
  params: {
    task: "Navigate to https://www.instagram.com/p/DQbuQqZDRUB/ and extract the post caption, username, likes, comments, hashtags, and mentions. Return as JSON.",
    apiKey: "your-browser-use-api-key",
    model: "gpt-4o"
  }
}
```

### Option 2: Firecrawl Scraper

Use the `firecrawl_scrape` tool to scrape Instagram post pages:

```typescript
{
  tool: "firecrawl_scrape",
  params: {
    url: "https://www.instagram.com/p/DQbuQqZDRUB/",
    apiKey: "your-firecrawl-api-key",
    scrapeOptions: {
      formats: ["markdown"]
    }
  }
}
```

### Option 3: HTTP Request (Limited)

Instagram pages are heavily JavaScript-rendered, so direct HTTP requests may not work well. However, you can try Instagram's oEmbed endpoint:

```typescript
{
  tool: "http_request",
  params: {
    url: "https://api.instagram.com/oembed/?url=https://www.instagram.com/p/DQbuQqZDRUB/",
    method: "GET"
  }
}
```

## Usage Example

To explain the Instagram post `DQbuQqZDRUB`:

1. **Using Instagram Graph API** (if configured):
   ```typescript
   {
     tool: "instagram_read",
     params: {
       mediaId: "DQbuQqZDRUB",
       accessToken: "your-access-token",
       includeInsights: true
     }
   }
   ```

2. **Using Browser Use** (fallback):
   ```typescript
   {
     tool: "browser_use_run_task",
     params: {
       task: "Go to https://www.instagram.com/p/DQbuQqZDRUB/ and extract: caption, username, engagement metrics, hashtags, mentions. Format as JSON.",
       apiKey: "your-api-key"
     }
   }
   ```

## Post URL Format

Instagram post URLs follow this format:
- `https://www.instagram.com/p/{SHORTCODE}/`
- Example: `https://www.instagram.com/p/DQbuQqZDRUB/`

The shortcode (e.g., `DQbuQqZDRUB`) can be used as the `mediaId` parameter, though Instagram Graph API typically requires numeric media IDs.
