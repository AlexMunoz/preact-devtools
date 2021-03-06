const { newPage } = require("pintf/browser_utils");
const path = require("path");

async function main() {
	const page = await newPage({
		headless: false,
		devtools: true,
		extensions: [path.join(__dirname, "..", "dist", "chrome")],
	});

	// Reset emulation
	await page._client.send("Emulation.clearDeviceMetricsOverride");

	await page.goto("https://preactjs.com");
}

main();
