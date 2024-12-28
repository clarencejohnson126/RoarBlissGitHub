export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.response?.data) {
    return res.status(err.response.status || 500).json({
      error: err.response.data
    });
  }

  res.status(500).json({
    error: 'Internal server error'
  });
};