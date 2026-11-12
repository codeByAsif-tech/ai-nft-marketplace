/**
 * Seeds the admin account from environment variables:
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 *
 * Usage: npm run seed:admin
 *
 * Safe to run more than once:
 * - No user with that email  -> creates an ADMIN with the hashed password.
 * - User already exists       -> makes sure it is an active ADMIN. The existing
 *                                password is NOT changed unless you pass --reset-password.
 */
import bcrypt from 'bcrypt';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User, ROLES } from '../src/models/User.js';

const resetPassword = process.argv.includes('--reset-password');

function readAdminConfig() {
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  const errors = [];
  if (!email) errors.push('ADMIN_EMAIL is required');
  else if (!/^\S+@\S+\.\S+$/.test(email)) errors.push('ADMIN_EMAIL is not a valid email');

  // Same rules as user registration, but a longer minimum for the admin account.
  if (!password) errors.push('ADMIN_PASSWORD is required');
  else {
    if (password.length < 12 || password.length > 72) errors.push('ADMIN_PASSWORD must be 12–72 characters');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
      errors.push('ADMIN_PASSWORD must contain a letter and a number');
  }

  if (name.length < 2 || name.length > 60) errors.push('ADMIN_NAME must be 2–60 characters');

  if (errors.length) {
    throw new Error(`Invalid admin config in .env:\n  - ${errors.join('\n  - ')}`);
  }
  return { name, email, password };
}

async function seedAdmin() {
  const { name, email, password } = readAdminConfig();
  await connectDB(env.mongoUri);

  const existing = await User.findOne({ email });

  if (!existing) {
    const hash = await bcrypt.hash(password, env.bcryptSaltRounds);
    // Created from the server's own config, so the email is trusted (no verification link needed).
    await User.create({ name, email, password: hash, role: ROLES.ADMIN, isActive: true, emailVerified: true, emailVerifiedAt: new Date() });
    console.log(`✔ Admin created: ${email}`);
    return;
  }

  const updates = { role: ROLES.ADMIN, isActive: true, emailVerified: true };
  if (resetPassword) {
    updates.password = await bcrypt.hash(password, env.bcryptSaltRounds);
    // New password: end every existing login session.
    updates.sessionsRevokedAt = new Date();
  }
  await User.updateOne({ _id: existing._id }, updates);

  console.log(
    `✔ Existing user ${email} is now an active ADMIN` +
      (resetPassword ? ' (password reset from .env)' : ' (password unchanged)')
  );
}

try {
  await seedAdmin();
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
} finally {
  await disconnectDB().catch(() => {});
}
