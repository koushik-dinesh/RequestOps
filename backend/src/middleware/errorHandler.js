const { ZodError } = require('zod');

function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed.',
        details: error.flatten(),
      },
    });
  }

  const statusCode = error.statusCode || 500;
  const message = statusCode === 500 ? 'Unexpected server error.' : error.message;

  if (statusCode === 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    error: {
      message,
      details: error.details,
    },
  });
}

module.exports = errorHandler;
