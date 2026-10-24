import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone só para a imagem Docker (o Dockerfile define STANDALONE=1)
  output: process.env.STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  // Só para a demonstração estática no GitHub Pages (scripts/export-demo.py)
  basePath: process.env.NEXT_BASE_PATH || undefined,
};

export default nextConfig;
