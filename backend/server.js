const app = require('./src/app');
const config = require('./src/config');

function start() {
	const server = app.listen(config.port, () => {
		console.log('──────────────────────────────────────────────');
		console.log(`🚀 ComboMaster API listening on port ${config.port}`);
		console.log(`   Environment: ${process.env.NODE_ENV || 'production'}`);
		console.log(`   Time:        ${new Date().toISOString()}`);
		console.log('──────────────────────────────────────────────');
	});

	// ── Runtime error logging ──────────────────────────────────────
	process.on('unhandledRejection', (reason, promise) => {
		console.error('[UNHANDLED REJECTION]', {
			time: new Date().toISOString(),
			reason: reason instanceof Error ? reason.stack : reason,
		});
	});

	process.on('uncaughtException', (err) => {
		console.error('[UNCAUGHT EXCEPTION]', {
			time: new Date().toISOString(),
			error: err.stack || err,
		});
		// Give the logger a moment, then exit so PM2/systemd can restart
		setTimeout(() => process.exit(1), 1000);
	});

	// ── Graceful shutdown ──────────────────────────────────────────
	const shutdown = (signal) => {
		console.log(`[SHUTDOWN] received ${signal}, closing server...`);
		server.close(() => {
			console.log('[SHUTDOWN] HTTP server closed.');
			process.exit(0);
		});
		// Force exit if connections hang
		setTimeout(() => {
			console.error('[SHUTDOWN] forced exit after 10s.');
			process.exit(1);
		}, 10000).unref();
	};
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));

	return server;
}

if (require.main === module) {
	start();
}

module.exports = { app, start };
