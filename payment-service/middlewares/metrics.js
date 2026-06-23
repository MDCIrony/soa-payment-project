const requestCounts = {};
const requestDurations = {};

const metricsCollector = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const method = req.method;
    const route = req.route ? req.route.path : req.path;
    const status = res.statusCode;

    if (route === '/metrics') return;

    const key = `method="${method}",route="${route}",status="${status}"`;
    requestCounts[key] = (requestCounts[key] || 0) + 1;
    requestDurations[key] = (requestDurations[key] || 0) + duration;
  });
  next();
};

const metricsExporter = (serviceName) => (req, res) => {
  let output = '';
  output += '# HELP http_requests_total Total number of HTTP requests\n';
  output += '# TYPE http_requests_total counter\n';
  for (const [key, count] of Object.entries(requestCounts)) {
    output += `http_requests_total{service="${serviceName}",${key}} ${count}\n`;
  }

  output += '\n# HELP http_request_duration_ms Total request duration in milliseconds\n';
  output += '# TYPE http_request_duration_ms counter\n';
  for (const [key, duration] of Object.entries(requestDurations)) {
    output += `http_request_duration_ms{service="${serviceName}",${key}} ${duration}\n`;
  }

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.end(output);
};

module.exports = {
  metricsCollector,
  metricsExporter
};
