# Proven Backend - EC2 Deployment Guide

## 🚀 Quick Start (15 minutes)

### Step 1: Launch EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Choose:
   - **AMI**: Amazon Linux 2023/2 (or Ubuntu 24.04 LTS)
   - **Instance type**: `t2.micro` (free tier) or `t3.micro`
   - **Key pair**: Create or select existing
   - **Security Group**: Allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS)
3. Launch and note the **Public IP**

### Step 2: Setup EC2

```bash
# SSH into your instance (Amazon Linux default user is ec2-user)
chmod 400 your-key.pem
ssh -i your-key.pem ec2-user@YOUR_EC2_IP

# Run setup script
curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/deploy/setup-ec2.sh | bash

# IMPORTANT: Logout and login for Docker permissions
exit
ssh -i your-key.pem ec2-user@YOUR_EC2_IP
```

### Step 3: Deploy Application

```bash
cd /opt/proven-backend

# Clone your repo
git clone https://github.com/YOUR_REPO.git .

# Create production env file
cp .env.production.example .env.production
nano .env.production  # Fill in your values

# Start the application
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
docker-compose -f docker-compose.prod.yml exec app npx prisma migrate deploy

# Check health
curl http://localhost:3001/health
```

### Step 4: Setup Domain & SSL

```bash
# Configure Nginx (Amazon Linux / most distros use conf.d)
sudo cp deploy/nginx.conf /etc/nginx/conf.d/proven-server.conf
sudo nano /etc/nginx/conf.d/proven-server.conf  # Set server_name to api.tryproven.fun
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificate (LetsEncrypt)
sudo certbot --nginx -d api.tryproven.fun
```

---

## 📋 Required Environment Variables

Create `.env.production` with these values:

```env
NODE_ENV=production
PORT=3001
SCHEDULER_ENABLED=true

# Database
DATABASE_URL=postgresql://user:pass@host:5432/proven

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx

# Security (generate with: openssl rand -base64 32)
JWT_SECRET=xxx
ESCROW_ENCRYPTION_KEY=xxx

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
ORACLE_KEYPAIR_JSON=[1,2,3,...]

# CORS
CORS_ORIGINS=https://your-frontend.com,https://admin.your-app.com
```

---

## 🔄 CI/CD with GitHub Actions

### Required GitHub Secrets

Go to Repository → Settings → Secrets → Actions:

| Secret | Description |
|--------|-------------|
| `EC2_HOST` | Your EC2 public IP or domain |
| `EC2_USER` | `ubuntu` (default for Ubuntu AMI) |
| `EC2_SSH_KEY` | Contents of your .pem file |

### How It Works

1. Push to `main` branch triggers workflow
2. Tests run (TypeScript check, build)
3. SSH into EC2 and run deploy script
4. Health check confirms deployment

---

## 🛠 Manual Operations

### View Logs
```bash
docker-compose -f docker-compose.prod.yml logs -f app
```

### Restart
```bash
docker-compose -f docker-compose.prod.yml restart
```

### Update & Redeploy
```bash
cd /opt/proven-backend
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
```

### Run Migrations
```bash
docker-compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

### Check Status
```bash
docker-compose -f docker-compose.prod.yml ps
curl http://localhost:3001/health
curl http://localhost:3001/ready
```

---

## 💰 Cost Breakdown

| Resource | Free Tier | After Free Tier |
|----------|-----------|-----------------|
| EC2 t2.micro | 750 hrs/month FREE | ~$8/month |
| EBS (30GB) | 30GB FREE | ~$3/month |
| Data Transfer | 100GB FREE | ~$0.09/GB |
| **Total** | **$0** | **~$12/month** |

---

## 🔒 Security Checklist

- [ ] Security group only allows 22, 80, 443
- [ ] SSH key permissions: `chmod 400 your-key.pem`
- [ ] SSL certificate installed (certbot)
- [ ] `.env.production` has strong secrets
- [ ] UFW firewall enabled (optional)
- [ ] Automatic security updates enabled

---

## 🆘 Troubleshooting

### Container won't start
```bash
docker-compose -f docker-compose.prod.yml logs app
```

### Database connection issues
```bash
# Test from container
docker-compose -f docker-compose.prod.yml exec app npx prisma db pull
```

### Out of memory (t2.micro has 1GB)
```bash
# Add swap space
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Health check failing
```bash
curl -v http://localhost:3001/health
curl -v http://localhost:3001/ready
```
