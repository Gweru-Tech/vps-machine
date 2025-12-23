const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Update user profile
router.put('/profile', [
  body('firstName').optional().isLength({ min: 1, max: 100 }),
  body('lastName').optional().isLength({ min: 1, max: 100 }),
  body('email').optional().isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email } = req.body;

    // Build update query dynamically
    let updateFields = [];
    let queryParams = [];
    let paramIndex = 1;

    if (firstName !== undefined) {
      updateFields.push(`first_name = $${paramIndex++}`);
      queryParams.push(firstName);
    }

    if (lastName !== undefined) {
      updateFields.push(`last_name = $${paramIndex++}`);
      queryParams.push(lastName);
    }

    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, req.user.userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      updateFields.push(`email = $${paramIndex++}`);
      queryParams.push(email);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    queryParams.push(req.user.userId);

    const result = await query(
      `UPDATE users SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex++} RETURNING id, email, first_name, last_name, plan_type, created_at`,
      queryParams
    );

    const user = result.rows[0];

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        planType: user.plan_type,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.put('/password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.user.userId]
    );

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Get user statistics
router.get('/stats', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         u.storage_quota,
         u.domain_quota,
         u.plan_type,
         u.created_at,
         (SELECT COUNT(*) FROM domains WHERE user_id = u.id) as domains_count,
         (SELECT COUNT(*) FROM websites WHERE user_id = u.id) as websites_count,
         (SELECT COUNT(*) FROM files WHERE user_id = u.id) as files_count,
         (SELECT COALESCE(SUM(file_size), 0) FROM files WHERE user_id = u.id) as storage_used,
         (SELECT SUM(download_count) FROM files WHERE user_id = u.id) as total_downloads
       FROM users u WHERE u.id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = result.rows[0];

    // Get recent activity
    const activityResult = await query(
      `SELECT 
         'file_upload' as activity_type,
         original_name as activity_description,
         created_at as activity_date
       FROM files WHERE user_id = $1
       
       UNION ALL
       
       SELECT 
         'domain_added' as activity_type,
         domain_name as activity_description,
         created_at as activity_date
       FROM domains WHERE user_id = $1
       
       ORDER BY activity_date DESC LIMIT 10`,
      [req.user.userId]
    );

    res.json({
      storage: {
        quota: stats.storage_quota,
        used: parseInt(stats.storage_used),
        available: stats.storage_quota - parseInt(stats.storage_used),
        percentage: Math.round((parseInt(stats.storage_used) / stats.storage_quota) * 100)
      },
      domains: {
        quota: stats.domain_quota,
        used: stats.domains_count,
        available: stats.domain_quota - stats.domains_count
      },
      resources: {
        websites: stats.websites_count,
        files: stats.files_count,
        totalDownloads: parseInt(stats.total_downloads) || 0
      },
      plan: {
        type: stats.plan_type,
        memberSince: stats.created_at
      },
      recentActivity: activityResult.rows
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

// Upgrade plan (placeholder for payment integration)
router.post('/upgrade', [
  body('planType').isIn(['pro', 'enterprise']).withMessage('Invalid plan type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { planType } = req.body;

    // Plan configurations
    const plans = {
      pro: {
        storage_quota: 10737418240, // 10GB
        domain_quota: 10
      },
      enterprise: {
        storage_quota: 107374182400, // 100GB
        domain_quota: 100
      }
    };

    const planConfig = plans[planType];
    if (!planConfig) {
      return res.status(400).json({ error: 'Invalid plan type' });
    }

    // In a real implementation, you would process payment here
    // For now, we'll just update the plan
    
    const result = await query(
      `UPDATE users SET plan_type = $1, storage_quota = $2, domain_quota = $3, 
              updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *`,
      [planType, planConfig.storage_quota, planConfig.domain_quota, req.user.userId]
    );

    const user = result.rows[0];

    res.json({
      message: `Successfully upgraded to ${planType} plan`,
      user: {
        id: user.id,
        planType: user.plan_type,
        storageQuota: user.storage_quota,
        domainQuota: user.domain_quota
      }
    });
  } catch (error) {
    console.error('Upgrade plan error:', error);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
});

// Delete account
router.delete('/account', [
  body('password').notEmpty().withMessage('Password is required'),
  body('confirmation').custom(value => {
    if (value !== 'DELETE') {
      throw new Error('Confirmation must be exactly "DELETE"');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password } = req.body;

    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    // Delete all user data (cascade will handle related records)
    await query('DELETE FROM users WHERE id = $1', [req.user.userId]);

    res.json({
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;