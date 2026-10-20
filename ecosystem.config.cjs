module.exports = {
    apps: [{
        name: 'zekbot420',
        script: './index.js',
        cwd: __dirname,
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        restart_delay: 5000,
        min_uptime: '30s',
        max_restarts: 1000000,
        max_memory_restart: '750M',
        kill_timeout: 15000,
        time: true,
        env: { NODE_ENV: 'production' },
    }],
};
