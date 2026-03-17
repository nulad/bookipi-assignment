 const app = require('./app');
 const config = require('./config/env');

 const server = app.listen(config.port, () => {
   console.log(`API server listening on port ${config.port}`);
 });

 module.exports = server;
