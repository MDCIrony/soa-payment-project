const path = require('path');

function getSwaggerHtml(title, swaggerUrl) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin:0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js" charset="UTF-8"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
    <script>
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          url: "${swaggerUrl}",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          layout: "BaseLayout"
        });
      };
    </script>
  </body>
  </html>`;
}

const setupSwagger = (app, title, schemaPath) => {
  app.get('/swagger.json', (req, res) => {
    res.sendFile(schemaPath);
  });
  app.get('/docs', (req, res) => {
    res.send(getSwaggerHtml(title, '/swagger.json'));
  });
};

module.exports = {
  getSwaggerHtml,
  setupSwagger
};
