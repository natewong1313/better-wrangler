import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  type Dirent,
} from "fs";
import { join } from "path";
import { promptText, promptTemplateSelection, promptConfirm } from "../utils/prompts";
import { createLogger } from "../../logger";

const log = createLogger("create-app");

const GITHUB_REPO = "natewong1313/better-wrangler";
const GITHUB_BRANCH = "main";

export const TEMPLATES = [
  { name: "kv-cache", description: "KV Namespace for caching" },
  { name: "d1-database", description: "D1 Database for data storage" },
  { name: "r2-storage", description: "R2 Bucket for file storage" },
  { name: "drizzle-orm", description: "D1 with Drizzle ORM integration" },
  { name: "monorepo", description: "Multi-worker setup with shared Durable Objects" },
] as const;

export type TemplateName = (typeof TEMPLATES)[number]["name"];

interface CreateAppOptions {
  force?: boolean;
}

export async function createAppCommand(
  projectName?: string,
  options: CreateAppOptions = {},
): Promise<void> {
  console.log("\n  better-wrangler create-app\n");

  // 1. Get project name
  const name =
    projectName ??
    (await promptText({
      message: "Project name:",
      defaultValue: "my-worker",
      validate: (v) => {
        if (!v.trim()) return "Project name is required";
        if (!/^[a-z0-9-_]+$/i.test(v)) return "Use only letters, numbers, hyphens, underscores";
        return true;
      },
    }));

  // 2. Check if directory exists
  const targetDir = join(process.cwd(), name);
  if (existsSync(targetDir)) {
    const overwrite = await promptConfirm(`Directory "${name}" already exists. Overwrite?`, false);
    if (!overwrite) {
      console.log("Aborted.");
      return;
    }
    rmSync(targetDir, { recursive: true });
  }

  // 3. Select template
  const template = await promptTemplateSelection(TEMPLATES);

  // 4. Download and extract
  console.log("\nDownloading template...");
  await downloadAndExtractTemplate(template, targetDir);

  // 5. Update package.json
  updatePackageJson(targetDir, name);

  // 6. Success message
  console.log(`\n✓ Created ${name}\n`);
  console.log("Next steps:");
  console.log(`  cd ${name}`);
  console.log("  bun install");
  console.log("  bw dev\n");
}

async function downloadAndExtractTemplate(
  template: TemplateName,
  targetDir: string,
): Promise<void> {
  const tarballUrl = `https://api.github.com/repos/${GITHUB_REPO}/tarball/${GITHUB_BRANCH}`;

  // Fetch tarball
  const response = await fetch(tarballUrl, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const tempDir = join(process.cwd(), `.create-app-temp-${Date.now()}`);
  const tarPath = join(tempDir, "repo.tar.gz");

  try {
    // Write tarball to temp file
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(tarPath, Buffer.from(arrayBuffer));

    // Extract tarball
    const proc = Bun.spawn(["tar", "-xzf", tarPath, "-C", tempDir], {
      stdout: "ignore",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Failed to extract tarball: ${stderr}`);
    }

    // Find extracted folder (GitHub adds prefix like "owner-repo-hash")
    const entries = readdirSync(tempDir);
    const extractedDir = entries.find((e) => e !== "repo.tar.gz");
    if (!extractedDir) throw new Error("Failed to find extracted directory");

    // Copy template to target
    const templateSource = join(tempDir, extractedDir, "examples", template);
    if (!existsSync(templateSource)) {
      throw new Error(`Template "${template}" not found in repository`);
    }

    copyDirSync(templateSource, targetDir);
    log.debug(`Copied template from ${templateSource} to ${targetDir}`);
  } finally {
    // Cleanup temp directory
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function updatePackageJson(targetDir: string, projectName: string): void {
  const pkgPath = join(targetDir, "package.json");
  if (!existsSync(pkgPath)) return;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

  // Update name
  pkg.name = projectName;

  // Fix workspace dependency
  if (pkg.dependencies?.["better-wrangler"]) {
    pkg.dependencies["better-wrangler"] = "^0.1.0";
  }

  // Update scripts to use bw instead of relative path
  if (pkg.scripts) {
    for (const [key, value] of Object.entries(pkg.scripts)) {
      if (typeof value === "string") {
        pkg.scripts[key] = value.replace(/bun run \.\.\/\.\.\/src\/cli\.ts/g, "bw");
      }
    }
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  log.debug(`Updated package.json for ${projectName}`);
}

function copyDirSync(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true }) as Dirent[];
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      writeFileSync(destPath, readFileSync(srcPath));
    }
  }
}
