import * as walletService from '../services/wallet.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const requestNonce = asyncHandler(async (req, res) => {
  const { address, chainId } = req.body;
  const data = await walletService.createNonce(req.user.id, { address, chainId });
  sendSuccess(res, { statusCode: 201, message: 'Sign this message in your wallet', data });
});

export const verifyWallet = asyncHandler(async (req, res) => {
  const { nonce, signature } = req.body;
  const user = await walletService.verifyAndLinkWallet(req.user.id, { nonce, signature });
  sendSuccess(res, { message: 'Wallet linked', data: { user: user.toJSON() } });
});

export const unlinkWallet = asyncHandler(async (req, res) => {
  const user = await walletService.unlinkWallet(req.user.id);
  sendSuccess(res, { message: 'Wallet unlinked', data: { user: user.toJSON() } });
});
