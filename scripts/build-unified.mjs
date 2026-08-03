import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const clientDir = path.join(rootDir, "courier-cart-client");
const outputDir = path.join(rootDir, "combined-dist");
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const skipInstall =
  String(process.env.UNIFIED_SKIP_INSTALL || "").toLowerCase() === "true";

const run = (cwd, args, envOverrides = {}) => {
  const command = isWindows ? "cmd.exe" : npmCommand;
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", [npmCommand, ...args].join(" ")]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd,
    env: { ...process.env, ...envOverrides },
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(
      `${npmCommand} ${args.join(" ")} failed in ${cwd}${
        result.error ? `: ${result.error.message}` : ""
      }`
    );
  }
};

if (!skipInstall) {
  run(clientDir, ["ci"]);
}

run(clientDir, ["run", "build", "--", "--base=/"]);

rmSync(outputDir, { force: true, recursive: true });
mkdirSync(outputDir, { recursive: true });
cpSync(path.join(clientDir, "dist"), outputDir, { recursive: true });

// Keep existing /app bookmarks working while the canonical client URL is /.
// Both entries serve the same client shell; the marketing landing is not copied.
mkdirSync(path.join(outputDir, "app"), { recursive: true });
cpSync(
  path.join(clientDir, "dist", "index.html"),
  path.join(outputDir, "app", "index.html"),
);

if (
  !existsSync(path.join(outputDir, "index.html")) ||
  !existsSync(path.join(outputDir, "app", "index.html"))
) {
  throw new Error("Client site build is incomplete");
}

console.log(`Client site created at ${outputDir}`);
