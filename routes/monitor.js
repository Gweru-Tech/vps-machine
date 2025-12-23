const express = require('express');
const { query } = require('../config/database');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get system health
router.get('/health', async (req, res) => {
  try {
    // Get database health
    const dbResult = await query('SELECT NOW() as current_time, version() as version');
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    
    // Get system uptime
    const uptime = process.uptime();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: uptime,
        human: formatUptime(uptime)
      },
      database: {
        status: 'connected',
        currentTime: dbResult.rows[0].current_time,
        version: dbResult.rows[0].version
      },
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
      },
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Get user analytics
router.get('/analytics', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    let dateFilter;
    switch (period) {
      case '24h':
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'24 hours\'';
        break;
      case '7d':
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'7 days\'';
        break;
      case '30d':
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'30 days\'';
        break;
      default:
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'7 days\'';
    }

    // Get page views
    const pageViewsResult = await query(
      `SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as views
       FROM analytics 
       WHERE user_id = $1 AND created_at >= ${dateFilter} AND event_type = 'page_view'
       GROUP BY DATE_TRUNC('day', created_at) 
       ORDER BY date ASC`,
      [req.user.userId]
    );

    // Get file downloads
    const downloadsResult = await query(
      `SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as downloads
       FROM analytics 
       WHERE user_id = $1 AND created_at >= ${dateFilter} AND event_type = 'file_download'
       GROUP BY DATE_TRUNC('day', created_at) 
       ORDER BY date ASC`,
      [req.user.userId]
    );

    // Get top pages
    const topPagesResult = await query(
      `SELECT event_data->>'page' as page, COUNT(*) as views
       FROM analytics 
       WHERE user_id = $1 AND created_at >= ${dateFilter} AND event_type = 'page_view'
       AND event_data->>'page' IS NOT NULL
       GROUP BY event_data->>'page' 
       ORDER BY views DESC LIMIT 10`,
      [req.user.userId]
    );

    // Get traffic sources
    const trafficSourcesResult = await query(
      `SELECT 
         CASE 
           WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
           WHEN referrer LIKE '%google%' THEN 'Google'
           WHEN referrer LIKE '%facebook%' THEN 'Facebook'
           WHEN referrer LIKE '%twitter%' THEN 'Twitter'
           WHEN referrer LIKE '%linkedin%' THEN 'LinkedIn'
           ELSE 'Other'
         END as source,
         COUNT(*) as visits
       FROM analytics 
       WHERE user_id = $1 AND created_at >= ${dateFilter}
       GROUP BY source 
       ORDER BY visits DESC`,
      [req.user.userId]
    );

    // Get error events
    const errorsResult = await query(
      `SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as errors
       FROM analytics 
       WHERE user_id = $1 AND created_at >= ${dateFilter} AND event_type = 'error'
       GROUP BY DATE_TRUNC('day', created_at) 
       ORDER BY date ASC`,
      [req.user.userId]
    );

    res.json({
      period,
      pageViews: pageViewsResult.rows,
      downloads: downloadsResult.rows,
      topPages: topPagesResult.rows,
      trafficSources: trafficSourcesResult.rows,
      errors: errorsResult.rows,
      summary: {
        totalPageViews: pageViewsResult.rows.reduce((sum, row) => sum + parseInt(row.views), 0),
        totalDownloads: downloadsResult.rows.reduce((sum, row) => sum + parseInt(row.downloads), 0),
        totalErrors: errorsResult.rows.reduce((sum, row) => sum + parseInt(row.errors), 0)
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get domain statistics
router.get('/domains/:id/stats', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    // Verify domain ownership
    const domainResult = await query(
      'SELECT id, domain_name FROM domains WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (domainResult.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Calculate date range
    let dateFilter;
    switch (period) {
      case '24h':
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'24 hours\'';
        break;
      case '7d':
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'7 days\'';
        break;
      case '30d':
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'30 days\'';
        break;
      default:
        dateFilter = 'CURRENT_TIMESTAMP - INTERVAL \'7 days\'';
    }

    // Get domain traffic
    const trafficResult = await query(
      `SELECT DATE_TRUNC('hour', created_at) as hour, COUNT(*) as requests
       FROM analytics 
       WHERE domain_id = $1 AND created_at >= ${dateFilter}
       GROUP BY DATE_TRUNC('hour', created_at) 
       ORDER BY hour ASC`,
      [req.params.id]
    );

    // Get top pages for this domain
    const topPagesResult = await query(
      `SELECT event_data->>'page' as page, COUNT(*) as views
       FROM analytics 
       WHERE domain_id = $1 AND created_at >= ${dateFilter} AND event_type = 'page_view'
       AND event_data->>'page' IS NOT NULL
       GROUP BY event_data->>'page' 
       ORDER BY views DESC LIMIT 10`,
      [req.params.id]
    );

    // Get error rates
    const errorRateResult = await query(
      `SELECT 
         DATE_TRUNC('day', created_at) as date,
         COUNT(*) as total_requests,
         COUNT(CASE WHEN event_type = 'error' THEN 1 END) as errors
       FROM analytics 
       WHERE domain_id = $1 AND created_at >= ${dateFilter}
       GROUP BY DATE_TRUNC('day', created_at) 
       ORDER BY date ASC`,
      [req.params.id]
    );

    // Calculate error percentage
    const errorRateWithPercentage = errorRateResult.rows.map(row => ({
      ...row,
      errorPercentage: row.total_requests > 0 ? 
        Math.round((parseInt(row.errors) / parseInt(row.total_requests)) * 100) : 0
    }));

    res.json({
      domain: domainResult.rows[0],
      period,
      traffic: trafficResult.rows,
      topPages: topPagesResult.rows,
      errorRates: errorRateWithPercentage,
      summary: {
        totalRequests: trafficResult.rows.reduce((sum, row) => sum + parseInt(row.requests), 0),
        totalErrors: errorRateResult.rows.reduce((sum, row) => sum + parseInt(row.errors), 0)
      }
    });
  } catch (error) {
    console.error('Domain stats error:', error);
    res.status(500).json({ error: 'Failed to fetch domain statistics' });
  }
});

// Log analytics event
router.post('/analytics/log', async (req, res) => {
  try {
    const { eventType, eventData, websiteId, domainId } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: 'Event type is required' });
    }

    // Get client information
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const referrer = req.get('Referer');

    await query(
      `INSERT INTO analytics (user_id, website_id, domain_id, event_type, 
                              event_data, ip_address, user_agent, referrer) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.user.userId,
        websiteId || null,
        domainId || null,
        eventType,
        JSON.stringify(eventData || {}),
        ip,
        userAgent,
        referrer
      ]
    );

    res.json({
      message: 'Analytics event logged successfully'
    });
  } catch (error) {
    console.error('Log analytics error:', error);
    res.status(500).json({ error: 'Failed to log analytics event' });
  }
});

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

module.exports = router;