// Alternative SANS Docker : pm2 start ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
  apps: [{
    name: 'kine-site',
    script: 'src/server.js',
    instances: 1,
    env: { NODE_ENV: 'production' },
    max_memory_restart: '300M',
    time: true,
  }],
};
