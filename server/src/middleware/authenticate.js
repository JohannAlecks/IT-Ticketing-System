const AppError = require('../utils/AppError');
const { verifyToken } = require('../utils/jwt');
const prisma = require('../config/prisma');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Authentication required', 401);
  }

  const token = header.split(' ')[1];
  const decoded = verifyToken(token);

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true, emailVerified: true, department: true },
  });

  if (!user || !user.isActive) {
    throw new AppError('User no longer exists or is inactive', 401);
  }
  // Defense in depth: login() already refuses to issue a JWT to an
  // unverified account, so this should be unreachable in normal operation.
  // It exists to protect against edge cases — e.g. a JWT issued before
  // this feature existed, or an admin process resetting emailVerified
  // after the fact.
  if (!user.emailVerified) {
    throw new AppError('Please verify your email address before continuing.', 401);
  }

  req.user = user;
  next();
});

module.exports = authenticate;
