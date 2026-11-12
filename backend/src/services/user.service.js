import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

// Fields a user may change on their own profile. Everything else
// (email, role, walletAddress, isActive, password) is ignored here.
const UPDATABLE_FIELDS = ['name', 'bio'];

export async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export async function updateProfile(userId, updates) {
  const allowed = {};
  for (const field of UPDATABLE_FIELDS) {
    if (updates[field] !== undefined) allowed[field] = updates[field];
  }

  if (Object.keys(allowed).length === 0) {
    throw ApiError.badRequest('No updatable fields provided');
  }

  const user = await User.findByIdAndUpdate(userId, allowed, {
    new: true,
    runValidators: true,
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}
