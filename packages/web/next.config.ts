import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Phase 7: standalone output for the production Docker image (see
  // packages/web/Dockerfile) - without this, the runtime image would need
  // the full node_modules tree instead of Next's traced, minimal subset.
  // outputFileTracingRoot is set explicitly to the monorepo root because
  // this is an npm-workspaces project - Next's own root-inference would
  // otherwise guess wrong (or warn) about where the real dependency tree
  // boundary is.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
