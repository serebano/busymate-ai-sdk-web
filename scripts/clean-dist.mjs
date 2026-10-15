// Remove dist/ before a build (cross-platform; tsup's own clean races between its two configs).
import { rmSync } from "node:fs";
rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
