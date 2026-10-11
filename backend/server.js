const app = require('./src/app');
const config = require('./src/config');

function start() {
	return app.listen(config.port, () => {
		console.log(`ComboMaster API listening on port ${config.port}`);
	});
}

if (require.main === module) {
	start();
}

module.exports = { app, start };
