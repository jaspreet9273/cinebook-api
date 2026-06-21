# Deployment Guide (Free Tier)

This project can be hosted entirely for free using the following providers.

---

## Infrastructure (Free Managed Services)

| Component | Provider      | Free Tier    | Setup             |
| --------- | ------------- | ------------ | ----------------- |
| MongoDB   | MongoDB Atlas | 512MB shared | atlas.mongodb.com |
| Redis     | Upstash       | 10K req/day  | upstash.com       |
| Kafka     | Upstash Kafka | 10K msg/day  | upstash.com/kafka |
| RabbitMQ  | CloudAMQP     | 1M msg/month | cloudamqp.com     |
| Email     | Resend        | 3000/month   | resend.com        |

---

## Application Hosting

### Option A — Railway (Recommended)

Railway gives $5/month free credit — enough for all 5 services.

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Deploy each service
cd services/api-gateway
railway init
railway up

# Repeat for each service
```

Set environment variables in Railway dashboard for each service.

### Option B — Render

Render has a free tier but services sleep after 15 minutes of inactivity.

1. Create a new Web Service for each service
2. Connect your GitHub repo
3. Set root directory to `services/<service-name>`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

---

## Environment Variables per Service

### api-gateway

```
JWT_SECRET=<same as user-service>
JWT_REFRESH_SECRET=<same as user-service>
USER_SERVICE_URL=<deployed url>
BOOKING_SERVICE_URL=<deployed url>
PAYMENT_SERVICE_URL=<deployed url>
SHOW_SERVICE_URL=<deployed url>
REDIS_URL=<upstash redis url>
CORS_ORIGINS=<your frontend url>
```

### user-service

```
MONGODB_URI=<atlas connection string>
JWT_SECRET=<generate with: openssl rand -hex 64>
JWT_REFRESH_SECRET=<generate with: openssl rand -hex 64>
```

### booking-service

```
MONGODB_URI=<atlas connection string>
REDIS_URL=<upstash redis url>
KAFKA_BROKERS=<upstash kafka broker>
RABBITMQ_URL=<cloudamqp url>
```

### payment-service

```
MONGODB_URI=<atlas connection string>
KAFKA_BROKERS=<upstash kafka broker>
RAZORPAY_KEY_ID=<from razorpay dashboard>
RAZORPAY_KEY_SECRET=<from razorpay dashboard>
RAZORPAY_WEBHOOK_SECRET=<set in razorpay webhook settings>
```

### show-service

```
MONGODB_URI=<atlas connection string>
```

### notification-service

```
RABBITMQ_URL=<cloudamqp url>
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<resend api key>
EMAIL_FROM=noreply@yourdomain.com
```

---

## Razorpay Webhook Setup

1. Go to Razorpay Dashboard → Webhooks
2. Add webhook URL: `https://<your-payment-service>/api/payments/webhook`
3. Select events: `payment.captured`, `payment.failed`, `refund.processed`
4. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`

For local testing use ngrok:

```bash
ngrok http 3002
# Use the https URL as webhook URL in Razorpay dashboard
```

---

## Production Checklist

- [ ] All JWT secrets are 64+ character random hex strings
- [ ] MongoDB Atlas IP whitelist configured
- [ ] Razorpay webhook signature verification enabled
- [ ] CORS origins set to actual frontend domain
- [ ] NODE_ENV=production on all services
- [ ] Health check URLs configured in Railway/Render
