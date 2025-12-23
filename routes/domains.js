const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get all domains for the authenticated user
router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, domain_name, status, ssl_status, created_at, updated_at, 
              expires_at, auto_renew, last_verified 
       FROM domains WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.userId]
    );

    res.json({
      domains: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Get domains error:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// Add a new domain
router.post('/', [
  body('domainName').isFQDN().withMessage('Must be a valid domain name'),
  body('autoRenew').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { domainName, autoRenew = false } = req.body;

    // Check user's domain quota
    const userResult = await query(
      'SELECT domain_quota, (SELECT COUNT(*) FROM domains WHERE user_id = $1) as current_count FROM users WHERE id = $2',
      [req.user.userId, req.user.userId]
    );

    const user = userResult.rows[0];
    if (user.current_count >= user.domain_quota) {
      return res.status(400).json({ error: 'Domain quota exceeded' });
    }

    // Check if domain already exists
    const existingDomain = await query(
      'SELECT id FROM domains WHERE domain_name = $1',
      [domainName]
    );

    if (existingDomain.rows.length > 0) {
      return res.status(400).json({ error: 'Domain already exists' });
    }

    // Generate verification token
    const verificationToken = uuidv4();

    // Create domain record
    const result = await query(
      `INSERT INTO domains (user_id, domain_name, verification_token, auto_renew) 
       VALUES ($1, $2, $3, $4) RETURNING id, domain_name, status, verification_token`,
      [req.user.userId, domainName, verificationToken, autoRenew]
    );

    const domain = result.rows[0];

    // Generate DNS configuration
    const dnsRecords = {
      cname: {
        name: domainName,
        value: `${process.env.RENDER_EXTERNAL_HOSTNAME || 'your-service.onrender.com'}`,
        ttl: 300
      },
      verification: {
        name: `_acme-challenge.${domainName}`,
        value: `${domain.id}.verify.renderdns.com`,
        ttl: 300
      }
    };

    // Update DNS records
    await query(
      'UPDATE domains SET dns_records = $1 WHERE id = $2',
      [JSON.stringify(dnsRecords), domain.id]
    );

    res.status(201).json({
      message: 'Domain added successfully',
      domain: {
        id: domain.id,
        domainName: domain.domain_name,
        status: domain.status,
        verificationToken: domain.verification_token,
        dnsRecords: dnsRecords,
        autoRenew: autoRenew
      }
    });
  } catch (error) {
    console.error('Add domain error:', error);
    res.status(500).json({ error: 'Failed to add domain' });
  }
});

// Get domain details
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM domains WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];

    res.json({
      domain: {
        id: domain.id,
        domainName: domain.domain_name,
        status: domain.status,
        sslStatus: domain.ssl_status,
        dnsRecords: domain.dns_records,
        verificationToken: domain.verification_token,
        expiresAt: domain.expires_at,
        autoRenew: domain.auto_renew,
        createdAt: domain.created_at,
        updatedAt: domain.updated_at,
        lastVerified: domain.last_verified
      }
    });
  } catch (error) {
    console.error('Get domain error:', error);
    res.status(500).json({ error: 'Failed to fetch domain' });
  }
});

// Verify domain
router.post('/:id/verify', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, domain_name, verification_token, status FROM domains 
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];

    // In a real implementation, you would check DNS records here
    // For now, we'll simulate verification
    const isVerified = Math.random() > 0.3; // Simulate 70% success rate

    if (isVerified) {
      await query(
        `UPDATE domains SET status = 'active', ssl_status = 'active', 
                last_verified = CURRENT_TIMESTAMP WHERE id = $1`,
        [domain.id]
      );

      res.json({
        message: 'Domain verified successfully',
        status: 'active',
        sslStatus: 'active'
      });
    } else {
      res.status(400).json({
        error: 'Domain verification failed',
        message: 'DNS records not configured correctly',
        dnsRecords: domain.dns_records
      });
    }
  } catch (error) {
    console.error('Verify domain error:', error);
    res.status(500).json({ error: 'Failed to verify domain' });
  }
});

// Update domain settings
router.put('/:id', [
  body('autoRenew').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { autoRenew } = req.body;

    const result = await query(
      `UPDATE domains SET auto_renew = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND user_id = $3 RETURNING *`,
      [autoRenew, req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json({
      message: 'Domain updated successfully',
      domain: result.rows[0]
    });
  } catch (error) {
    console.error('Update domain error:', error);
    res.status(500).json({ error: 'Failed to update domain' });
  }
});

// Delete domain
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM domains WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json({
      message: 'Domain deleted successfully'
    });
  } catch (error) {
    console.error('Delete domain error:', error);
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// Get DNS configuration for a domain
router.get('/:id/dns', async (req, res) => {
  try {
    const result = await query(
      `SELECT domain_name, dns_records, status FROM domains 
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domain = result.rows[0];

    res.json({
      domainName: domain.domain_name,
      status: domain.status,
      dnsRecords: domain.dns_records,
      instructions: {
        provider: 'generic',
        records: [
          {
            type: 'CNAME',
            name: domain.domain_name,
            value: process.env.RENDER_EXTERNAL_HOSTNAME || 'your-service.onrender.com',
            ttl: 300
          },
          {
            type: 'CNAME',
            name: `_acme-challenge.${domain.domain_name}`,
            value: `${req.params.id}.verify.renderdns.com`,
            ttl: 300
          }
        ]
      }
    });
  } catch (error) {
    console.error('Get DNS config error:', error);
    res.status(500).json({ error: 'Failed to get DNS configuration' });
  }
});

module.exports = router;