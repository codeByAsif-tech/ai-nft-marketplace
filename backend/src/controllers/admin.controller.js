import { matchedData } from 'express-validator';
import * as adminService from '../services/admin.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const stats = asyncHandler(async (_req, res) => {
  sendSuccess(res, { data: await adminService.getPlatformStats() });
});

export const activity = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type } = matchedData(req, { locations: ['query'] });
  sendSuccess(res, { data: await adminService.getPlatformActivity({ page, limit, type }) });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, role, status } = matchedData(req, { locations: ['query'] });
  sendSuccess(res, { data: await adminService.listUsers({ page, limit, search, role, status }) });
});

export const updateUser = asyncHandler(async (req, res) => {
  // Only `isActive` is validated and passed on; roles can't be changed via the API.
  const { isActive } = matchedData(req, { locations: ['body'] });
  const user = await adminService.setUserActive(req.user.id, req.params.id, isActive);
  sendSuccess(res, { message: isActive ? 'User reactivated' : 'User deactivated', data: { user } });
});
