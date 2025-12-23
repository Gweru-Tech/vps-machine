const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./config/database');
const { router: authRoutes } = require('./routes/auth');
const domainRoutes = require('./routes/domains');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/users');
const monitorRoutes = require('./routes/monitor');

const app = express();
const PORT = process.env.PORT || 10000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.RENDER_EXTERNAL_URL || "http://localhost:10000"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Basic middleware
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving
app.use('/uploads', express.static('uploads'));

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: require('./package.json').version
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/monitor', monitorRoutes);

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all handler for SPA (except for API routes)
app.get('*', (req, res) => {
  // Don't intercept API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'File too large' });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database schema
    await initDatabase();
    
    // Start server - IMPORTANT: Bind to 0.0.0.0 for Render.com
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Hosting VPS Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
      console.log(`📁 Uploads directory: ${process.env.UPLOAD_DIR || './uploads'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;