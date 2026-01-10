# Domain Setup - DNS Propagation Guide

## Status

✅ Domain purchased through Vercel  
✅ Domain configured in Vercel  
⏳ Waiting for DNS propagation (this is normal!)

## What is DNS Propagation?

DNS propagation is the time it takes for DNS changes to spread across the internet. When you configure a domain in Vercel, DNS records need to be updated at various DNS servers worldwide. This process can take:

- **Typically:** A few minutes to a few hours
- **Sometimes:** Up to 24-48 hours (though usually faster)
- **Average:** 15 minutes to 2 hours

## How to Check DNS Propagation

### Method 1: Vercel Dashboard (Easiest)

1. Go to your Vercel project dashboard
2. Click on **Settings** → **Domains**
3. Look for your domain in the list
4. You'll see one of these statuses:
   - 🟡 **Pending** or **Propagating** - Still waiting for DNS propagation
   - ✅ **Valid** or **Connected** - Domain is ready! (Green checkmark)

### Method 2: Online DNS Checkers

Use online tools to check DNS propagation:

1. **DNS Checker** (https://dnschecker.org/)
   - Enter your domain name
   - Select "A" record type
   - Click "Search"
   - If all locations show Vercel's IP addresses, DNS has propagated

2. **WhatsMyDNS** (https://www.whatsmydns.net/)
   - Enter your domain
   - Select "A" record
   - Check if DNS records are updated globally

### Method 3: Command Line (Terminal)

If you want to check from your computer:

```bash
# Check if domain is resolving to Vercel
dig yourdomain.com +short

# Or on Windows/Mac, you can use:
nslookup yourdomain.com
```

You should see Vercel IP addresses in the response when DNS has propagated.

## What Happens After DNS Propagation

Once DNS propagation is complete:

1. **Vercel will automatically:**
   - ✅ Activate your custom domain
   - ✅ Provision SSL certificate (HTTPS) automatically
   - ✅ Your site will be live at `yourdomain.com` and `www.yourdomain.com`

2. **Your production site will be accessible at:**
   - `https://yourdomain.com` (custom domain)
   - `https://www.yourdomain.com` (www subdomain)
   - `https://strumkey-site-xxxxx.vercel.app` (original Vercel URL - still works)

3. **All features will work:**
   - ✅ HTTPS/SSL automatically enabled
   - ✅ Automatic redirects configured
   - ✅ Production database connections work
   - ✅ Everything works exactly as before, just with your custom domain

## Important Notes

### SSL Certificate
- Vercel automatically provisions SSL certificates for your domain
- This usually happens within a few minutes after DNS propagation
- You don't need to configure SSL manually
- Your site will automatically use HTTPS

### Multiple Domains
- Your original Vercel URL (`*.vercel.app`) will continue to work
- Both custom domain and Vercel URL will serve the same site
- Users can access your site via either URL

### Subdomain for Staging (Optional)
If you want to set up `staging.yourdomain.com` for staging:

1. After your main domain is live, go to **Settings** → **Domains**
2. Click "Add Domain"
3. Enter `staging.yourdomain.com`
4. Vercel will show you DNS records to add (usually a CNAME record)
5. Add the DNS record in your domain registrar
6. Wait for DNS propagation again (usually faster, 15-30 minutes)
7. Configure it to point to your preview deployments

**Note:** This is optional - the auto-generated preview URL works fine for staging.

## Troubleshooting

### Domain Still Not Working After 24 Hours

1. **Check DNS Records:**
   - Go to your domain registrar (where you bought the domain)
   - Verify DNS records match what Vercel shows
   - Common records needed:
     - A record: `@` → Vercel IP (shown in Vercel dashboard)
     - CNAME record: `www` → `cname.vercel-dns.com`

2. **Check Vercel Dashboard:**
   - Go to Settings → Domains
   - Check for any error messages
   - Vercel will show specific issues if DNS records are incorrect

3. **Clear DNS Cache:**
   - Sometimes your local DNS cache needs clearing
   - Try accessing the site from a different network (mobile data)
   - Or clear your browser's DNS cache

### Domain Shows as "Invalid" in Vercel

- Check that DNS records are exactly as Vercel shows them
- Make sure there are no typos in DNS records
- Wait a bit longer - sometimes it takes time for Vercel to detect changes

## What to Do Right Now

1. ✅ **Wait for DNS propagation** - This is normal and automatic
2. ✅ **Check Vercel dashboard periodically** - Status will update automatically
3. ✅ **Continue using your site** - Original Vercel URL still works
4. ✅ **Once domain shows as "Valid"** - Test accessing your site at the custom domain

## Expected Timeline

- **0-15 minutes:** DNS propagation may begin
- **15 minutes - 2 hours:** DNS typically propagates (most common)
- **2-24 hours:** Full global propagation (less common)
- **After DNS propagates:** Vercel provisions SSL certificate (5-15 minutes)

## Next Steps After Domain is Live

Once your domain is live at `yourdomain.com`:

1. **Test your site:**
   - Visit `https://yourdomain.com`
   - Visit `https://www.yourdomain.com`
   - Verify everything works (login, songs, etc.)

2. **Update any references:**
   - Update bookmarks
   - Update any documentation with your new domain
   - Share your custom domain with users

3. **Optional - Set up staging subdomain:**
   - Configure `staging.yourdomain.com` if desired
   - Or continue using auto-generated preview URLs for staging

---

**Current Status:** ⏳ Waiting for DNS propagation  
**Next Check:** Check Vercel dashboard for domain status  
**Estimated Time:** Usually 15 minutes to 2 hours  

Once your domain shows as "Valid" in Vercel, your site will be live at your custom domain with automatic HTTPS! 🎉
