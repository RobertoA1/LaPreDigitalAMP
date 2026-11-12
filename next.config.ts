import type { NextConfig } from 'next';
const nextConfig: NextConfig = { serverExternalPackages: ['sequelize', 'sqlite3', 'tedious', 'msnodesqlv8'] };
export default nextConfig;
