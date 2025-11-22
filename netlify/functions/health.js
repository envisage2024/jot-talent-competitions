exports.handler = async function(event, context) {
  // simple health check
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ status: 'OK', message: 'Netlify payment function is available', environment: process.env.NODE_ENV || 'production' })
  };
};
