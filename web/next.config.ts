import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Static export, for two reasons.
   *
   * It costs nothing: the app is entirely client-side (localStorage progress,
   * client components, no API routes or server actions) and every route already
   * prerendered as static.
   *
   * And it unblocks the deploy. The build must run from the REPO ROOT, because
   * scripts/sync-data.mjs copies the question banks out of the root into
   * web/public/data and those aren't committed — but Vercel only detects the
   * Next.js framework when its Root Directory holds the package.json that
   * depends on `next` (i.e. web/). Exporting to plain files sidesteps framework
   * detection: vercel.json builds from the root and serves web/out.
   *
   * Export emits verbal.html etc., so vercel.json sets cleanUrls to keep the
   * app's extensionless links (/verbal) working.
   */
  output: "export",
};

export default nextConfig;
