// Custom error class
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
  }
}

// Database connection error detector
function isDatabaseConnectionError(err) {
  return err.code && [
    'PROTOCOL_CONNECTION_LOST',
    'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    'PROTOCOL_PACKETS_OUT_OF_ORDER',
    'ECONNREFUSED',
    'ECONNRESET',
    'ER_QUERY_TIMEOUT',
  ].includes(err.code);
}

// Global error handler middleware with enhanced recovery
function errorHandler(err, req, res, next) {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.error(`[Error ${errorId}]`, {
    message: err.message,
    code: err.code,
    name: err.name,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  });

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let retryable = false;

  // Database errors with specific handling
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'This record already exists.';
  } else if (err.code === 'ER_FOREIGN_KEY_CONSTRAINT') {
    statusCode = 400;
    message = 'Invalid reference to related record.';
  } else if (err.code === 'ER_NO_REFERENCED_ROW') {
    statusCode = 400;
    message = 'Referenced record not found.';
  } else if (err.code === 'ER_QUERY_TIMEOUT') {
    statusCode = 503;
    message = 'Database query timed out. Please try again.';
    retryable = true;
  } else if (isDatabaseConnectionError(err)) {
    statusCode = 503;
    message = 'Database connection error. Please try again.';
    retryable = true;
  } else if (err.code === 'ENOENT') {
    statusCode = 404;
    message = 'Resource not found.';
  } else if (err.code === 'EACCES') {
    statusCode = 403;
    message = 'Access denied.';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired. Please refresh your token.';
  } else if (err.name === 'SyntaxError' && err.status === 400) {
    statusCode = 400;
    message = 'Invalid JSON in request body.';
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    if (err.code === 'FILE_TOO_LARGE') {
      statusCode = 413;
      message = 'File size exceeds maximum limit (25MB).';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      statusCode = 413;
      message = 'Too many files. Maximum is 10 files.';
    } else {
      statusCode = 400;
      message = 'File upload error.';
    }
  }

  // Prevent leaking internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'An unexpected error occurred. Please try again later.';
  }

  res.status(statusCode).json({
    error: {
      id: errorId,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      retryable,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: err.stack,
        code: err.code,
        name: err.name,
      }),
    },
  });
}

// Async error wrapper for route handlers
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Socket error handler
function setupSocketErrorHandling(io) {
  io.on('connection', (socket) => {
    socket.on('error', (error) => {
      console.error('[Socket Error]', {
        userId: socket.user?.id,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnection gracefully
    socket.on('disconnect', (reason) => {
      console.log('[Socket Disconnect]', {
        userId: socket.user?.id,
        reason,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle connection errors
    socket.on('connect_error', (error) => {
      console.error('[Socket Connect Error]', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    });
  });
}

// Recovery strategies
const recoveryStrategies = {
  // Automatic reconnection with exponential backoff
  exponentialBackoff: (attempt) => {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    return delay + Math.random() * 1000; // Add jitter
  },

  // Retry with circuit breaker pattern
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
  },

  // Data sync recovery
  dataSyncRecovery: async (lastSyncTimestamp) => {
    // Request data that was missed since lastSyncTimestamp
    return {
      newMessages: true,
      newNotifications: true,
      updatedUsers: true,
      timestamp: new Date().toISOString(),
    };
  },
};

// Graceful shutdown handler
function setupGracefulShutdown(server, pool) {
  const shutdown = async (signal) => {
    console.log(`[Shutdown] Received ${signal}, shutting down gracefully...`);

    // Stop accepting new connections
    server.close(() => {
      console.log('[Shutdown] HTTP server closed');
    });

    // Close database pool
    try {
      await pool.end();
      console.log('[Shutdown] Database connection closed');
    } catch (err) {
      console.error('[Shutdown] Error closing database:', err);
    }

    // Close remaining connections
    setTimeout(() => {
      console.log('[Shutdown] Force closing remaining connections');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
  setupSocketErrorHandling,
  recoveryStrategies,
  setupGracefulShutdown,
};
