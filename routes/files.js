const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticateToken } = require('./auth');
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userUploadDir = path.join(process.env.UPLOAD_DIR || './uploads', req.user.userId);
    
    try {
      await fs.mkdir(userUploadDir, { recursive: true });
      cb(null, userUploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 // 50MB default
  },
  fileFilter: (req, file, cb) => {
    // Basic file type validation
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'text/plain', 'text/html', 'text/css', 'text/javascript',
      'application/pdf', 'application/json', 'application/xml',
      'application/zip', 'application/x-zip-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('text/')) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// Get all files for the authenticated user
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let queryStr = `
      SELECT id, original_name, stored_name, file_size, mime_type, 
             is_public, download_count, created_at 
      FROM files 
      WHERE user_id = $1
    `;
    let queryParams = [req.user.userId];

    if (search) {
      queryStr += ` AND original_name ILIKE $2`;
      queryParams.push(`%${search}%`);
    }

    queryStr += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const result = await query(queryStr, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM files WHERE user_id = $1';
    let countParams = [req.user.userId];
    
    if (search) {
      countQuery += ` AND original_name ILIKE $2`;
      countParams.push(`%${search}%`);
    }

    const countResult = await query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      files: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Upload a file
router.post('/upload', upload.single('file'), [
  body('isPublic').optional().isBoolean()
], async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { isPublic = false } = req.body;

    // Check user's storage quota
    const userResult = await query(
      `SELECT storage_quota, 
              (SELECT COALESCE(SUM(file_size), 0) FROM files WHERE user_id = $1) as current_storage 
       FROM users WHERE id = $2`,
      [req.user.userId, req.user.userId]
    );

    const user = userResult.rows[0];
    if (user.current_storage + req.file.size > user.storage_quota) {
      // Delete uploaded file if quota exceeded
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: 'Storage quota exceeded' });
    }

    // Save file info to database
    const result = await query(
      `INSERT INTO files (user_id, original_name, stored_name, file_path, 
                          file_size, mime_type, is_public) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.user.userId,
        req.file.originalname,
        req.file.filename,
        req.file.path,
        req.file.size,
        req.file.mimetype,
        isPublic
      ]
    );

    const file = result.rows[0];

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: file.id,
        originalName: file.original_name,
        storedName: file.stored_name,
        fileSize: file.file_size,
        mimeType: file.mime_type,
        isPublic: file.is_public,
        downloadUrl: `/api/files/download/${file.id}`,
        publicUrl: file.is_public ? `/uploads/${req.user.userId}/${file.stored_name}` : null,
        createdAt: file.created_at
      }
    });
  } catch (error) {
    console.error('Upload file error:', error);
    
    // Clean up uploaded file if error occurred
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to cleanup file:', cleanupError);
      }
    }
    
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Download a file
router.get('/download/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM files WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // Check if user has access (either owner or public file)
    if (file.user_id !== req.user.userId && !file.is_public) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(file.file_path);
    } catch (error) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Increment download count
    await query(
      'UPDATE files SET download_count = download_count + 1 WHERE id = $1',
      [req.params.id]
    );

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Length', file.file_size);

    // Stream file
    const fileStream = require('fs').createReadStream(file.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Update file settings
router.put('/:id', [
  body('isPublic').optional().isBoolean(),
  body('originalName').optional().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { isPublic, originalName } = req.body;

    // Build update query dynamically
    let updateFields = [];
    let queryParams = [];
    let paramIndex = 1;

    if (typeof isPublic === 'boolean') {
      updateFields.push(`is_public = $${paramIndex++}`);
      queryParams.push(isPublic);
    }

    if (originalName) {
      updateFields.push(`original_name = $${paramIndex++}`);
      queryParams.push(originalName);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    queryParams.push(req.params.id, req.user.userId);

    const result = await query(
      `UPDATE files SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} RETURNING *`,
      queryParams
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      message: 'File updated successfully',
      file: result.rows[0]
    });
  } catch (error) {
    console.error('Update file error:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// Delete a file
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM files WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // Delete file from disk
    try {
      await fs.unlink(file.file_path);
    } catch (error) {
      console.error('Failed to delete file from disk:', error);
    }

    // Delete file record from database
    await query(
      'DELETE FROM files WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    res.json({
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get file statistics
router.get('/stats/usage', async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         COUNT(*) as total_files,
         COALESCE(SUM(file_size), 0) as total_size,
         COUNT(CASE WHEN is_public = true THEN 1 END) as public_files,
         COUNT(CASE WHEN is_public = false THEN 1 END) as private_files,
         SUM(download_count) as total_downloads
       FROM files WHERE user_id = $1`,
      [req.user.userId]
    );

    const stats = result.rows[0];

    // Get user's quota
    const userResult = await query(
      'SELECT storage_quota FROM users WHERE id = $1',
      [req.user.userId]
    );

    const user = userResult.rows[0];

    res.json({
      totalFiles: parseInt(stats.total_files),
      totalSize: parseInt(stats.total_size),
      publicFiles: parseInt(stats.public_files),
      privateFiles: parseInt(stats.private_files),
      totalDownloads: parseInt(stats.total_downloads),
      storageQuota: user.storage_quota,
      storageUsed: parseInt(stats.total_size),
      storageAvailable: user.storage_quota - parseInt(stats.total_size),
      usagePercentage: Math.round((parseInt(stats.total_size) / user.storage_quota) * 100)
    });
  } catch (error) {
    console.error('Get file stats error:', error);
    res.status(500).json({ error: 'Failed to get file statistics' });
  }
});

module.exports = router;