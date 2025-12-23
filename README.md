# Hosting VPS - Full Hosting Solution for Render.com

A comprehensive hosting VPS solution that can be deployed on Render.com with custom domain support, SSL management, file storage, and analytics.

## Features

### 🚀 Core Features
- **Custom Domain Management**: Add, verify, and manage custom domains with automatic SSL
- **File Storage**: Secure file upload and management with public/private options
- **User Authentication**: JWT-based authentication with secure password handling
- **Analytics Dashboard**: Real-time traffic monitoring and statistics
- **Responsive UI**: Modern, mobile-friendly dashboard interface

### 🛠️ Technical Features
- **Render.com Optimized**: Configured for Render's deployment requirements
- **PostgreSQL Database**: Scalable database with optimized schema
- **RESTful API**: Clean, well-documented API endpoints
- **Security**: Rate limiting, CORS, helmet security headers
- **Monitoring**: Health checks and error tracking

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Render.com account (for deployment)

### Local Development

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd hosting-vps
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   # Create PostgreSQL database
   createdb hosting_vps
   
   # Set DATABASE_URL in .env
   DATABASE_URL=postgresql://username:password@localhost:5432/hosting_vps
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

### Deployment on Render.com

1. **Push to GitHub/GitLab**
   ```bash
   git add .
   git commit -m "Initial setup"
   git push origin main
   ```

2. **Create Render Service**
   - Go to Render Dashboard
   - Click "New → Web Service"
   - Connect your repository
   - Configure with `render.yaml`

3. **Set Environment Variables**
   ```
   NODE_ENV=production
   JWT_SECRET=your-secret-key
   DATABASE_URL=your-render-postgres-url
   ```

## API Documentation

### Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Domains

#### Get All Domains
```http
GET /api/domains
Authorization: Bearer <token>
```

#### Add Domain
```http
POST /api/domains
Authorization: Bearer <token>
Content-Type: application/json

{
  "domainName": "example.com",
  "autoRenew": true
}
```

#### Verify Domain
```http
POST /api/domains/:id/verify
Authorization: Bearer <token>
```

### Files

#### Upload File
```http
POST /api/files/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <file>
isPublic: true
```

#### Get Files
```http
GET /api/files?page=1&limit=20
Authorization: Bearer <token>
```

#### Download File
```http
GET /api/files/download/:id
Authorization: Bearer <token>
```

### Analytics

#### Get Analytics
```http
GET /api/monitor/analytics?period=7d
Authorization: Bearer <token>
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `10000` |
| `HOST` | Server host | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL connection | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | Token expiration | `7d` |
| `MAX_FILE_SIZE` | Max upload size | `50MB` |
| `UPLOAD_DIR` | Upload directory | `./uploads` |
| `CORS_ORIGIN` | CORS allowed origin | `http://localhost:3000` |

### Render.com Specific Configuration

The application is optimized for Render.com with:

- **Port Binding**: Automatically uses Render's PORT environment variable
- **Health Check**: `/health` endpoint for Render's monitoring
- **Static File Serving**: Proper configuration for file uploads
- **Database**: PostgreSQL integration with automatic schema setup
- **SSL**: Automatic SSL certificate management for custom domains

## Database Schema

### Core Tables

- **users**: User accounts and authentication
- **domains**: Custom domain management
- **files**: File storage and metadata
- **websites**: Hosted website configurations
- **analytics**: Traffic and usage statistics
- **sessions**: User session management
- **api_keys**: API key authentication

### Relationships

- Users have many domains, files, and websites
- Domains belong to users
- Files belong to users
- Analytics events are tracked per user and domain

## Security Features

- **Authentication**: JWT-based with secure password hashing
- **Authorization**: Role-based access control
- **Rate Limiting**: Configurable rate limits per endpoint
- **CORS**: Proper cross-origin resource sharing
- **Helmet**: Security headers for HTTP requests
- **Input Validation**: Comprehensive input sanitization
- **File Security**: File type validation and size limits

## Monitoring & Analytics

### Built-in Metrics

- Traffic analytics (page views, unique visitors)
- File download tracking
- Error monitoring
- Storage usage statistics
- Domain performance metrics

### Health Checks

```http
GET /health
```

Returns:
- Server status
- Database connection
- Memory usage
- Uptime information

## File Management

### Supported File Types

- Images: JPEG, PNG, GIF, WebP
- Documents: PDF, TXT, HTML, CSS, JS
- Archives: ZIP

### Storage Features

- Public/private file access
- Download tracking
- File size limits
- User quota management
- Secure file serving

## Custom Domain Setup

### DNS Configuration

For each custom domain, create the following DNS records:

```
Type: CNAME
Name: yourdomain.com
Value: your-service.onrender.com
TTL: 300

Type: CNAME  
Name: _acme-challenge.yourdomain.com
Value: [service-id].verify.renderdns.com
TTL: 300
```

### SSL Management

- Automatic SSL certificate generation
- Certificate renewal tracking
- SSL status monitoring
- Error handling for SSL issues

## Development

### Project Structure

```
hosting-vps/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── render.yaml            # Render.com configuration
├── .env.example           # Environment template
├── config/
│   └── database.js        # Database configuration
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── domains.js         # Domain management
│   ├── files.js           # File operations
│   ├── users.js           # User management
│   └── monitor.js         # Analytics & monitoring
├── database/
│   └── schema.sql         # Database schema
├── public/
│   ├── css/
│   │   └── dashboard.css   # Dashboard styles
│   ├── js/
│   │   └── dashboard.js    # Dashboard JavaScript
│   └── index.html         # Dashboard HTML
└── README.md              # This file
```

### Scripts

- `npm start`: Production server
- `npm run dev`: Development with nodemon
- `npm run build`: Production build
- `npm test`: Run tests

## Deployment Guide

### Step 1: Prepare Repository

1. Push code to GitHub/GitLab
2. Ensure all environment variables are documented
3. Test database schema

### Step 2: Configure Render

1. Create new Web Service
2. Connect repository
3. Set build command: `npm install --production`
4. Set start command: `npm start`
5. Configure environment variables

### Step 3: Database Setup

1. Create PostgreSQL service on Render
2. Get connection string
3. Add to environment variables
4. Deploy to trigger schema initialization

### Step 4: Domain Configuration

1. Add custom domain in Render dashboard
2. Configure DNS records
3. Verify domain ownership
4. Monitor SSL certificate generation

## Troubleshooting

### Common Issues

**Database Connection**
- Check DATABASE_URL format
- Verify PostgreSQL service is running
- Ensure firewall allows connection

**Domain Verification**
- DNS propagation may take time
- Verify CNAME records are correct
- Check for conflicting records

**File Upload Issues**
- Check file size limits
- Verify upload directory permissions
- Ensure sufficient storage quota

**SSL Certificate Issues**
- Wait for DNS propagation
- Verify domain ownership
- Check CAA records if configured

### Logs and Monitoring

- Application logs: Available in Render dashboard
- Database logs: PostgreSQL service logs
- Error tracking: Built-in error monitoring
- Performance: Response time and throughput metrics

## Support

For issues and questions:

1. Check Render.com documentation
2. Review application logs
3. Verify configuration settings
4. Test API endpoints independently

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

---

**Built for Render.com** | **Deploy with confidence** | **Scale automatically**