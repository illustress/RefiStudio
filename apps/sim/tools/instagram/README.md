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

### Option 1: Browser Use (Requires Instagram Login)

Use the `browser_use_run_task` tool to navigate to Instagram and extract content. **Note: Instagram requires login, so you must provide credentials.**

```typescript
{
  tool: "browser_use_run_task",
  params: {
    task: "Navigate to https://www.instagram.com/p/DQbuQqZDRUB/ and extract the post caption, username, likes, comments, hashtags, and mentions. Return as JSON.",
    apiKey: "your-browser-use-api-key",
    model: "gpt-4o",
    variables: {
      "INSTAGRAM_USERNAME": "your-username",
      "INSTAGRAM_PASSWORD": "your-password"
    }
  }
}
```

**Important**: The task should include login instructions:
```typescript
{
  task: "First, go to https://www.instagram.com/accounts/login/ and log in using the INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD variables. Then navigate to https://www.instagram.com/p/DQbuQqZDRUB/ and extract: caption, username, likes, comments, hashtags, mentions. Return as JSON."
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

2. **Using Browser Use** (requires login):
   ```typescript
   {
     tool: "browser_use_run_task",
     params: {
       task: "First log in to Instagram at https://www.instagram.com/accounts/login/ using INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD. Then go to https://www.instagram.com/p/DQbuQqZDRUB/ and extract: caption, username, engagement metrics, hashtags, mentions. Format as JSON.",
       apiKey: "your-api-key",
       variables: {
         "INSTAGRAM_USERNAME": "your-username",
         "INSTAGRAM_PASSWORD": "your-password"
       }
     }
   }
   ```

## Post URL Format

Instagram post URLs follow this format:
- `https://www.instagram.com/p/{SHORTCODE}/`
- Example: `https://www.instagram.com/p/DQbuQqZDRUB/`

The shortcode (e.g., `DQbuQqZDRUB`) can be used as the `mediaId` parameter, though Instagram Graph API typically requires numeric media IDs.
