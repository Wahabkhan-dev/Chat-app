# PRODUCTION HARDENING & DEPLOYMENT GUIDE
**Version**: 3.0 - Final Optimization Pass
**Date**: May 21, 2026

## 🚀 Pre-Deployment Checklist

### 1. Environment Configuration

Create `.env` file with all required variables:

```bash
# Server
NODE_ENV=production
PORT=3001

# Database
DATABASE_HOST=your-db-host
DATABASE_PORT=3306
DATABASE_USER=your-db-user
DATABASE_PASSWORD=your-db-password
DATABASE_NAME=mawby_teams

# JWT
JWT_SECRET=your-very-long-random-secret-key-minimum-32-chars
JWT_EXPIRY=24h

# R2 Storage
R2_ENDPOINT=your-r2-endpoint
R2_BUCKET_NAME=your-bucket-name
R2_ACCESS_KEY_ID=your-key-id
R2_SECRET_ACCESS_KEY=your-secret-key

# CORS - Comma-separated list of allowed origins
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com,https://app.yourdomain.com

# File Upload
UPLOAD_ROOT=/var/uploads

# Admin User
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-password
```

### 2. Database Setup

```bash
# Connect to MySQL
mysql -h $DATABASE_HOST -u $DATABASE_USER -p

# Create database
CREATE DATABASE mawby_teams CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Grant privileges
GRANT ALL PRIVILEGES ON mawby_teams.* TO '$DATABASE_USER'@'$DATABASE_HOST';
FLUSH PRIVILEGES;
```

### 3. Dependency Installation

```bash
cd Back-End
npm install --production

# Verify critical dependencies
npm list express socket.io mysql2 jsonwebtoken bcryptjs
```

### 4. Database Migrations

The migrations run automatically on server startup, but you can run them manually:

```bash
node setup-db.js
node scripts/create_admin_user.js
```

### 5. File Permissions

```bash
# Set upload directory permissions
mkdir -p /var/uploads
chmod 755 /var/uploads
chown -R app-user:app-group /var/uploads

# Set log directory
mkdir -p /var/logs/mawby-teams
chmod 755 /var/logs/mawby-teams
chown -R app-user:app-group /var/logs/mawby-teams
```

## 🔐 Security Hardening

### 1. HTTPS/SSL Configuration

Use a reverse proxy (Nginx) with SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/ssl/certs/your-cert.crt;
    ssl_certificate_key /etc/ssl/private/your-key.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### 2. Rate Limiting at Infrastructure Level

Consider adding rate limiting at Nginx/WAF level:

```nginx
# Nginx rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=10r/m;

location /api/ {
    limit_req zone=api_limit burst=20;
    proxy_pass http://localhost:3001;
}

location /api/upload {
    limit_req zone=upload_limit burst=5;
    proxy_pass http://localhost:3001;
}
```

### 3. DDoS Protection

- Use CloudFlare or similar DDoS mitigation service
- Enable rate limiting at WAF level
- Monitor for unusual traffic patterns

### 4. Database Security

```sql
-- Create restricted database user for app
CREATE USER 'mawby_app'@'localhost' IDENTIFIED BY 'strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON mawby_teams.* TO 'mawby_app'@'localhost';

-- No root access in production
-- Use parameterized queries (already implemented)
-- Enable SSL for DB connections
```

### 5. API Keys & Secrets

- Rotate JWT_SECRET every 90 days
- Store secrets in secure vault (not in code)
- Use separate R2 credentials for read/write
- Never commit .env to git

## 📊 Monitoring & Logging

### 1. Application Logging

Set up centralized logging (e.g., ELK Stack, Datadog):

```javascript
// In production, implement structured logging
const logger = (level, context, message, data) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'mawby-teams-backend',
    context,
    message,
    ...data,
  }));
};

// Use: logger('error', 'socket.js', 'Connection failed', { userId, error })
```

### 2. Performance Monitoring

Monitor these key metrics:

```
- API response times (p50, p95, p99)
- Socket connection count
- Database query times
- Error rate (errors per 1000 requests)
- 500 error frequency
- Rate limit violations
- Memory usage trends
- CPU usage patterns
```

### 3. Health Check Integration

The `/api/health` endpoint returns detailed stats:

```bash
# Check health in production
curl https://yourdomain.com/api/health

# Response includes:
# - uptime
# - optimization stats
# - memory usage
# - attachment service stats
```

## 🔄 Deployment Process

### 1. Blue-Green Deployment

```bash
# 1. Build and test new version
npm install
npm test

# 2. Start on alternate port
PORT=3002 node server.js &

# 3. Test new instance
curl http://localhost:3002/api/health

# 4. Switch traffic (via load balancer or nginx)
# Update upstream to point to 3002

# 5. Monitor for errors (5-10 minutes)
# Check logs and metrics

# 6. Stop old instance once stable
kill <old-process-id>
```

### 2. Rollback Procedure

```bash
# If issues detected during deployment:

# 1. Revert traffic to previous version
# Update load balancer/nginx config

# 2. Restart with previous code
git revert <commit-hash>
npm install
node server.js

# 3. Investigate issues
tail -f logs/error.log

# 4. Fix and redeploy
```

### 3. Scheduled Downtime (if needed)

```bash
# 1. Set maintenance mode
# Update response to 503 Service Unavailable

# 2. Drain connections gracefully
# Give 30-60 seconds for clients to disconnect

# 3. Stop server
kill <process-id>

# 4. Run migrations if needed
node setup-db.js

# 5. Restart server
node server.js
```

## 🧹 Maintenance Tasks

### Daily
- [ ] Monitor error rates
- [ ] Check disk space usage
- [ ] Verify backup completion

### Weekly
- [ ] Review performance metrics
- [ ] Check for security vulnerabilities
- [ ] Test backup restore procedure
- [ ] Review rate limit statistics

### Monthly
- [ ] Security audit
- [ ] Database optimization (ANALYZE tables)
- [ ] Update dependencies
- [ ] Capacity planning review

### Quarterly
- [ ] Disaster recovery drill
- [ ] Security penetration test
- [ ] Performance load testing
- [ ] Architecture review

## 🐛 Troubleshooting Guide

### High Error Rate

```bash
# 1. Check logs
tail -f /var/logs/mawby-teams/error.log

# 2. Check database connection
mysql -h $DATABASE_HOST -u $DATABASE_USER -p$DATABASE_PASSWORD -e "SHOW PROCESSLIST;"

# 3. Check disk space
df -h /var/uploads

# 4. Check memory
free -m

# 5. Restart if needed
systemctl restart mawby-teams-backend
```

### Slow API Responses

```bash
# 1. Check database slow query log
# Enable in MySQL:
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;

# 2. Review socket connections
netstat -an | grep :3001

# 3. Check rate limiter state
# Add endpoint to expose optimization stats

# 4. Consider database query optimization
# Run ANALYZE TABLE on large tables
```

### Socket Connection Issues

```bash
# 1. Check socket.io logs
grep -i "socket" /var/logs/mawby-teams/error.log

# 2. Verify CORS configuration
# Check ALLOWED_ORIGINS in .env

# 3. Check firewall rules
sudo firewall-cmd --list-all

# 4. Test socket connection
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  https://yourdomain.com/socket.io/
```

## 📈 Scaling Strategies

### Vertical Scaling (Single Server)
- Increase Node.js worker threads
- Increase database connection pool size
- Increase server RAM
- Use faster CPU

### Horizontal Scaling (Multiple Servers)
1. **Load Balancer** (HAProxy, Nginx)
2. **Sticky Sessions** for socket.io
3. **Shared Session Store** (Redis)
4. **Database Replication** (Master-Slave)
5. **Separate Read Replicas** for read-heavy queries

### Redis for Production

For distributed socket.io and caching:

```javascript
const redis = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

const pubClient = redis.createClient({ host: 'redis-host', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

// Also use for rate limiting
// Also use for session cache
```

## 🎯 Performance Optimization Checklist

- [x] Query caching implemented
- [x] Database indexes created
- [x] Socket event deduplication
- [x] Rate limiting enforced
- [x] Error handling comprehensive
- [x] Attachment service optimized
- [x] Connection pooling configured
- [x] Graceful degradation (R2 fallback)
- [ ] CDN for static assets (if frontend separate)
- [ ] Redis for distributed caching (if scaling horizontally)
- [ ] Database query optimization (run EXPLAIN plans)
- [ ] Minification and compression
- [ ] Load testing completed

## 🚨 Incident Response

### Email/Notification Alerts

Set up alerts for:
- Error rate > 5%
- Response time > 1 second (p95)
- Database connection pool > 80%
- Disk space < 10%
- 500 error spike

### Incident Severity Levels

**Critical** (Immediate Action)
- 500 errors > 1% of requests
- System completely down
- Data corruption detected

**High** (Within 30 minutes)
- API latency > 5 seconds
- Socket connections failing
- Rate limits being hit frequently

**Medium** (Within 2 hours)
- Performance degradation
- Minor bug impacts subset of users

**Low** (Backlog)
- Non-critical features failing
- Performance slightly below threshold

## ✅ Final Checklist Before Going Live

```
Pre-Launch
- [ ] All environment variables set correctly
- [ ] Database migrations completed successfully
- [ ] SSL certificates installed and valid
- [ ] Firewall rules configured
- [ ] Backups configured and tested
- [ ] Monitoring and alerting active
- [ ] Logging configured
- [ ] Load testing completed successfully
- [ ] Security audit completed
- [ ] Documentation up-to-date

Launch Day
- [ ] Health checks passing
- [ ] Smoke tests successful
- [ ] Team monitoring dashboard open
- [ ] On-call rotation active
- [ ] Rollback plan ready
- [ ] Communication channels established

Post-Launch (First 24 hours)
- [ ] Monitor error rates continuously
- [ ] Check API response times
- [ ] Monitor database load
- [ ] Verify backups running
- [ ] Review logs for issues
- [ ] Check rate limiter statistics
```

---

**Status**: ✅ PRODUCTION READY
**Last Updated**: May 21, 2026
**Maintained By**: DevOps Team
