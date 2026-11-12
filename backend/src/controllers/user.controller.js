import { getDashboard } from '../services/dashboard.service.js';
import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getMyProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: { user: req.user.toJSON() } });
});

export const getMyDashboard = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await getDashboard(req.user.id) });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);
  sendSuccess(res, { message: 'Profile updated', data: { user: user.toJSON() } });
});
