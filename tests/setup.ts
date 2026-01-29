import { afterEach } from "vitest";
import { cleanupTempProjects } from "./utils/temp-project";

// Clean up any temp projects after each test
afterEach(async () => {
	await cleanupTempProjects();
});
