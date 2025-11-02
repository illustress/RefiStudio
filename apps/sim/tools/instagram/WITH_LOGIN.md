# Instagram Post Reading with Browser Use + Login

Since Instagram requires authentication to view posts, you need to provide login credentials when using Browser Use.

## Setup

1. **Get Browser Use API Key** (you already have this: `bu_uD7gxvPqxfreHE3llG0_Z86GDynJTwi09Bxqh1Vdfr4`)

2. **Prepare Instagram Credentials**
   - Username: Your Instagram username
   - Password: Your Instagram password

## Usage Example

```typescript
{
  tool: "browser_use_run_task",
  params: {
    task: `First, navigate to https://www.instagram.com/accounts/login/ and log in using the INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD variables provided. Wait for the login to complete and you're redirected to the Instagram home feed. Then navigate to https://www.instagram.com/p/DQbuQqZDRUB/ and extract the following information in JSON format:
    - Post caption/text
    - Username of the account
    - Number of likes
    - Number of comments  
    - All hashtags (#hashtag)
    - All user mentions (@username)
    - Post type (photo, video, or carousel)
    - If carousel, how many items
    
    Return the data as a structured JSON object.`,
    apiKey: "bu_uD7gxvPqxfreHE3llG0_Z86GDynJTwi09Bxqh1Vdfr4",
    model: "gpt-4o",
    variables: {
      "INSTAGRAM_USERNAME": "your-instagram-username",
      "INSTAGRAM_PASSWORD": "your-instagram-password"
    }
  }
}
```

## Security Notes

?? **Important Security Considerations**:

1. **Never commit credentials to git** - Always use environment variables or secure credential storage
2. **Use environment variables** in production:
   ```typescript
   variables: {
     "INSTAGRAM_USERNAME": process.env.INSTAGRAM_USERNAME,
     "INSTAGRAM_PASSWORD": process.env.INSTAGRAM_PASSWORD
   }
   ```
3. **Consider using a dedicated test account** rather than your personal account
4. **Instagram may flag automated logins** - Use sparingly to avoid account restrictions

## Alternative: Instagram Graph API

For production use, Instagram Graph API is recommended:
- More reliable and official
- Doesn't require sharing passwords
- Uses OAuth tokens instead
- Better rate limits
- See `SETUP_API_KEYS.md` for setup instructions

## Troubleshooting

- **Login fails**: Instagram may require 2FA - Browser Use may struggle with this
- **Account flagged**: Too many automated logins can trigger Instagram's security
- **Task timeout**: Login + navigation can take time - Browser Use has timeout limits
- **Rate limiting**: Instagram may still rate limit even after login
