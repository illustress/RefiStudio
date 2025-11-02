# How to Get API Keys for Instagram Post Reading

To read Instagram posts, you'll need API keys from one of these services. Here's how to get them:

## Option 1: Browser Use (Recommended)

**Browser Use** is a browser automation service that can navigate Instagram and extract content.

### Steps to Get Browser Use API Key:

1. **Visit Browser Use Website**
   - Go to: https://browser-use.com/
   - Click "Sign Up" or "Get Started"

2. **Create an Account**
   - Sign up with your email or GitHub account
   - Complete the registration process

3. **Get Your API Key**
   - Once logged in, navigate to your dashboard/account settings
   - Look for "API Keys" or "Developer" section
   - Copy your API key

4. **Usage**
   ```typescript
   {
     tool: "browser_use_run_task",
     params: {
       task: "Navigate to https://www.instagram.com/p/DQbuQqZDRUB/ and extract the post caption, username, likes, comments, hashtags, and mentions. Return as structured JSON.",
       apiKey: "your-api-key-here"
     }
   }
   ```

**Note**: Browser Use may offer a free tier or trial. Check their pricing page for details.

---

## Option 2: Firecrawl

**Firecrawl** is a web scraping service that can extract content from Instagram pages.

### Steps to Get Firecrawl API Key:

1. **Visit Firecrawl Website**
   - Go to: https://firecrawl.dev/
   - Click "Sign Up" or "Get Started"

2. **Create an Account**
   - Sign up with your email
   - Verify your email address

3. **Get Your API Key**
   - Log in to your dashboard
   - Navigate to "API Keys" section
   - Generate a new API key
   - Copy the key (you may only see it once!)

4. **Usage**
   ```typescript
   {
     tool: "firecrawl_scrape",
     params: {
       url: "https://www.instagram.com/p/DQbuQqZDRUB/",
       apiKey: "your-api-key-here"
     }
   }
   ```

**Note**: Firecrawl offers a free tier with limited requests. Check their pricing at https://firecrawl.dev/pricing

---

## Option 3: Instagram Graph API (Official Method)

For production use, consider using Instagram's official Graph API:

### Steps:

1. **Create a Facebook App**
   - Go to: https://developers.facebook.com/
   - Create a new app
   - Add "Instagram Graph API" product

2. **Set Up Instagram Business Account**
   - Convert your Instagram account to Business or Creator account
   - Connect it to your Facebook Page

3. **Get Access Token**
   - Follow Instagram Graph API authentication flow
   - Get long-lived access token

4. **Usage**
   ```typescript
   {
     tool: "instagram_read",
     params: {
       mediaId: "DQbuQqZDRUB",
       accessToken: "your-access-token"
     }
   }
   ```

**Note**: This method requires:
- Instagram Business or Creator account (not personal)
- Facebook Page connected to Instagram account
- More complex setup but official and reliable

---

## Quick Start Guide

1. **Choose a service** (Browser Use is easiest for quick testing)
2. **Sign up** and get your API key
3. **Use the tool** with your API key in the `apiKey` parameter
4. **Read the Instagram post** at: https://www.instagram.com/p/DQbuQqZDRUB/

---

## Troubleshooting

- **API key not working**: Make sure you copied the entire key without extra spaces
- **Rate limits**: Free tiers have usage limits - check your account dashboard
- **Instagram blocking**: Some scraping methods may be blocked by Instagram's anti-bot measures
- **Browser Use timeout**: Browser automation tasks can take 30-60 seconds to complete

---

## Cost Comparison

- **Browser Use**: Check https://browser-use.com/pricing
- **Firecrawl**: Free tier available, then paid plans
- **Instagram Graph API**: Free (but requires Business/Creator account setup)
