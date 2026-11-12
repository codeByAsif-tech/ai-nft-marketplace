/**
 * Promotes an existing user to ADMIN. There is deliberately no API for this:
 * the first admin must be created by someone with database/server access.
 *
 * Usage: npm run make-admin -- user@example.com
 */
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User, ROLES } from '../src/models/User.js';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}

try {
  await connectDB(env.mongoUri);
  const user = await User.findOneAndUpdate({ email }, { role: ROLES.ADMIN }, { new: true });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`${user.email} is now ${user.role}`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
