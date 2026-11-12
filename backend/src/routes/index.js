import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import walletRoutes from './wallet.routes.js';
import aiRoutes from './ai.routes.js';
import { NETWORKS, publicNetwork } from '../config/networks.js';
import nftRoutes from './nft.routes.js';
import marketplaceRoutes from './marketplace.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? 'OK' : 'Database unavailable',
    data: { uptime: Math.round(process.uptime()), database: dbConnected ? 'connected' : 'disconnected' },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/wallet', walletRoutes);
router.use('/ai', aiRoutes);
router.use('/nfts', nftRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/admin', adminRoutes);

// Public list of supported networks (no RPC URLs that may contain API keys).
router.get('/networks', (_req, res) => {
  res.json({ success: true, message: 'OK', data: Object.values(NETWORKS).map(publicNetwork) });
});

export default router;
