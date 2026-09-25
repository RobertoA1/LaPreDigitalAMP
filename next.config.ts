import type { NextConfig } from 'next';
const nextConfig: NextConfig = { serverExternalPackages: ['sequelize', 'sqlite3', 'tedious'] };
export default nextConfig;
