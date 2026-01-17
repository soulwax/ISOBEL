# How to Check Which Port Your Application is Running On

## Quick Commands

### 1. Check Listening Ports
```bash
# See all listening ports (look for 3001, 3003)
ss -tlnp | grep -E ":(3001|3003|5173)"

# Or using netstat (if ss not available)
netstat -tlnp | grep -E ":(3001|3003|5173)"

# Or using lsof
lsof -i :3001
lsof -i :3003
```

### 2. Check PM2 Process Environment
```bash
# See environment variables for isobel-web
pm2 describe isobel-web | grep -A 10 "env:"

# See all PM2 process info
pm2 show isobel-web
```

### 3. Check PM2 Logs
```bash
# View recent logs
pm2 logs isobel-web --lines 30

# View logs in real-time
pm2 logs isobel-web

# Check for port information in logs
pm2 logs isobel-web | grep -i "port\|3001\|listening"
```

### 4. Test the Port
```bash
# Test if port 3001 is responding
curl -I http://localhost:3001/

# Test with verbose output
curl -v http://localhost:3001/

# Test specific endpoint
curl http://localhost:3001/api/health
```

### 5. Check Process Details
```bash
# See what port the Node process is using
ps aux | grep isobel-web

# Check process file descriptors (shows open ports)
ls -l /proc/$(pm2 pid isobel-web)/fd/ | grep socket
```

## Current Status

Based on the last check:
- ✅ **Port 3001**: Listening on `0.0.0.0:3001` (isobel-web)
- ✅ **Port 3003**: Listening (isobel-auth)
- ✅ **HTTP Response**: Port 3001 returns 200 OK

## Issue Fixed

The problem was that `scripts/start-web.js` was using CommonJS syntax (`require()`) but `package.json` has `"type": "module"`. The script has been converted to ES modules.

## Running in Production Mode

To run in production mode (serving from `./build`), use:

```bash
npm run build:prod
npm run pm2:start:prod
```

**Note:** `npm run pm2:start` defaults to development mode. Use `pm2:start:prod` for production.
