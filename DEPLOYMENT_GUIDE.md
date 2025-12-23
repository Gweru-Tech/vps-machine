# Deployment Guide - Hosting VPS on Render.com

This comprehensive guide will walk you through deploying the Hosting VPS solution on Render.com with custom domains, SSL certificates, and full functionality.

## Prerequisites

1. **Render.com Account**
   - Create a free account at [render.com](https://render.com)
   - Verify your email address

2. **Version Control**
   - GitHub, GitLab, or Bitbucket account
   - Repository with the Hosting VPS code

3. **Domain Name** (Optional)
   - Registered domain name for custom hosting
   - Access to DNS management

## Step 1: Prepare Your Repository

### 1.1 Push Code to Git

```bash
git init
git add .
git commit -m "Initial Hosting VPS setup"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

### 1.2 Verify Repository Structure

Ensure your repository has this structure:

```
hosting-vps/
├── server.js
├── package.json
├── render.yaml
├── .env.example
├── database/
│   └── schema.sql
├── routes/
├── config/
├── public/
└── README.md
```

## Step 2: Create Render Services

### 2.1 PostgreSQL Database

1. **Create Database Service**
   - Go to Render Dashboard
   - Click "New → PostgreSQL"
   - Choose a name (e.g., `hosting-db`)
   - Select region closest to your users
   - Choose "Free" plan to start
   - Click "Create Database"

2. **Get Connection Details**
   - After creation, click on your database
   - Go to "Connect" tab
   - Copy the "External Database URL"
   - It will look like: `postgresql://user:password@host:port/database`

### 2.2 Main Web Service

1. **Create Web Service**
   - Go to Render Dashboard
   - Click "New → Web Service"
   - Connect your Git repository
   - Select the branch (`main`)
   - Click "Next"

2. **Configure Service Settings**

```yaml
# These settings will be in render.yaml automatically
Name: hosting-vps
Environment: Node
Build Command: npm install --production
Start Command: npm start
Plan: Free
Region: [Same as database]
```

3. **Advanced Settings**
   - Health Check Path: `/health`
   - Auto-Deploy: Yes (for development)
   - Instance Type: Standard

### 2.3 Optional: Redis Cache

1. **Create Redis Service**
   - Click "New → Redis"
   - Choose a name (e.g., `hosting-cache`)
   - Select same region as other services
   - Choose "Free" plan
   - Click "Create Redis"

## Step 3: Configure Environment Variables

### 3.1 Web Service Environment Variables

Go to your Web Service → Settings → Environment and add:

**Required Variables:**
```
NODE_ENV=production
DATABASE_URL=<your-postgres-connection-url>
JWT_SECRET=your-super-secure-jwt-secret-key-here
```

**Optional Variables:**
```
REDIS_URL=<your-redis-connection-url>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAX_FILE_SIZE=50MB
CORS_ORIGIN=https://yourdomain.com
```

**Security Notes:**
- `JWT_SECRET` should be a long, random string
- Use a password generator for secrets
- Never commit secrets to Git

### 3.2 Generate Secure JWT Secret

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -hex 64
```

## Step 4: Deploy and Test

### 4.1 Initial Deployment

1. **Trigger Deployment**
   - Render will automatically deploy on save
   - Monitor the build logs
   - Wait for "Live" status

2. **Verify Health Check**
   - Open: `https://your-service.onrender.com/health`
   - Should return JSON with status: "healthy"

3. **Test Registration**
   - Open: `https://your-service.onrender.com/login.html`
   - Create a test account
   - Verify dashboard loads

### 4.2 Troubleshooting Common Issues

**Build Fails:**
```bash
# Check package.json dependencies
npm install --production
# Ensure all required files are committed
git add .
git commit -m "Add missing files"
```

**Database Connection Error:**
- Verify DATABASE_URL format
- Check database is running
- Ensure firewall allows connection

**Application Not Starting:**
- Check server logs in Render dashboard
- Verify PORT configuration (should use environment variable)
- Ensure server binds to 0.0.0.0

## Step 5: Setup Custom Domain

### 5.1 Add Domain in Render

1. **Go to Web Service → Settings → Custom Domains**
2. **Click "+ Add Custom Domain"**
3. **Enter your domain** (e.g., `yourdomain.com`)
4. **Click "Save"**

Render will show you the required DNS configuration.

### 5.2 Configure DNS Records

**For Root Domain (yourdomain.com):**
```
Type: CNAME
Name: @ (or yourdomain.com)
Value: your-service.onrender.com
TTL: 300
```

**For Subdomain (www.yourdomain.com):**
```
Type: CNAME
Name: www
Value: your-service.onrender.com
TTL: 300
```

**For SSL Verification (Automatic):**
```
Type: CNAME
Name: _acme-challenge
Value: [service-id].verify.renderdns.com
TTL: 300
```

### 5.3 Domain Provider Specific Instructions

**Cloudflare:**
1. Log in to Cloudflare dashboard
2. Select your domain
3. Go to DNS settings
4. Add CNAME record
5. **Important:** Set proxy status to "DNS only" (gray cloud)

**Namecheap:**
1. Log in to Namecheap
2. Go to Domain List → Manage
3. Go to "Advanced DNS"
4. Add CNAME record
5. Remove any conflicting A records

**GoDaddy:**
1. Log in to GoDaddy
2. Go to DNS Management
3. Add CNAME record
4. Save changes

### 5.4 Verify Domain

1. **Wait for DNS Propagation** (5-30 minutes)
2. **Go back to Render Dashboard**
3. **Click "Verify" next to your domain**
4. **Wait for SSL certificate** (can take up to an hour)

## Step 6: Production Configuration

### 6.1 Upgrade Plan (Optional)

For production use, consider upgrading:

**Web Service:**
- Standard plan ($7/month) for better performance
- Custom build timeout
- More RAM and CPU

**Database:**
- Standard plan for more connections
- Automatic backups
- Higher storage limits

### 6.2 Security Hardening

**Enable Rate Limiting:**
```bash
# Already configured in server.js
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

**Configure CORS:**
```
CORS_ORIGIN=https://yourdomain.com
```

**Set Secure Cookies:**
```javascript
// Add to server.js if needed
app.use(session({
  secret: process.env.JWT_SECRET,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  }
}));
```

### 6.3 Backup Strategy

**Database Backups:**
- Enable automatic backups in Render PostgreSQL settings
- Set backup retention period
- Test backup restoration

**File Backups:**
- Important files should be version controlled
- Consider using Render's disk persistence
- Implement user file export functionality

## Step 7: Monitoring and Maintenance

### 7.1 Application Monitoring

**Built-in Health Checks:**
- `/health` endpoint
- Monitor response times
- Check error rates

**Render Monitoring:**
- Service metrics dashboard
- Log aggregation
- Alert notifications

### 7.2 Performance Optimization

**Database Optimization:**
```sql
-- Add indexes for better performance
CREATE INDEX CONCURRENTLY idx_files_user_id_created 
ON files(user_id, created_at DESC);
```

**Caching:**
- Implement Redis caching if needed
- Cache frequently accessed data
- Use CDN for static assets

### 7.3 Security Updates

**Regular Tasks:**
- Update dependencies monthly
- Review security advisories
- Monitor access logs
- Rotate JWT secrets periodically

## Step 8: Scaling Considerations

### 8.1 When to Scale

**Indicators:**
- High CPU usage (>80% consistently)
- Memory pressure
- Slow response times
- Database connection limits

### 8.2 Scaling Options

**Vertical Scaling:**
- Upgrade to larger instance type
- Increase RAM and CPU
- Adjust build timeout

**Horizontal Scaling:**
- Multiple instances with load balancer
- Database read replicas
- CDN for static content

## Troubleshooting Guide

### Common Deployment Issues

**Issue: Service won't start**
```
Solution: Check server logs in Render dashboard
Look for: Database connection errors, missing environment variables
```

**Issue: Database connection failed**
```
Solution: Verify DATABASE_URL format
Test: Connect with psql client locally
```

**Issue: Custom domain not working**
```
Solution: Check DNS propagation
Use: dig yourdomain.com CNAME
Wait: DNS can take 24-48 hours to propagate fully
```

**Issue: SSL certificate error**
```
Solution: Verify DNS records are correct
Check: CAA records if configured
Wait: SSL generation can take up to 60 minutes
```

**Issue: File uploads failing**
```
Solution: Check upload directory permissions
Verify: Render disk persistence is enabled
Check: File size limits
```

### Log Analysis

**Viewing Logs:**
1. Go to Web Service → Logs
2. Filter by timeframe
3. Look for error patterns
4. Check response codes

**Common Log Messages:**
```
ERROR: Connection refused (database)
ERROR: Port already in use
ERROR: Cannot find module
WARN: Memory usage high
```

## Success Checklist

- [ ] Web service deployed and running
- [ ] Database connected and schema initialized
- [ ] Health check endpoint responding
- [ ] User registration/login working
- [ ] File uploads functional
- [ ] Custom domain configured
- [ ] SSL certificate issued
- [ ] Dashboard loading correctly
- [ ] Monitoring enabled
- [ ] Backup strategy implemented

## Support Resources

**Render Documentation:**
- [Web Services](https://render.com/docs/web-services)
- [Custom Domains](https://render.com/docs/custom-domains)
- [PostgreSQL](https://render.com/docs/postgresql)

**Community:**
- [Render Community](https://community.render.com)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/render)

**Emergency Support:**
- Check status page: status.render.com
- Review troubleshooting logs
- Contact Render support for platform issues

---

**Next Steps:**
1. Monitor your deployment for 24-48 hours
2. Test all user flows
3. Set up monitoring alerts
4. Plan regular maintenance schedule

**Congratulations!** 🎉 Your Hosting VPS is now running on Render.com with custom domains and full functionality.