/**
 * Seeds the database with an initial Admin, one Agent, one User, and a
 * couple of sample tickets so you have something to click through
 * immediately after setup.
 *
 * Run with: npm run prisma:seed
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('Password123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { name: 'Ada Admin', email: 'admin@example.com', password, role: 'ADMIN' },
  });

  const agent = await prisma.user.upsert({
    where: { email: 'agent@example.com' },
    update: {},
    create: { name: 'Alex Agent', email: 'agent@example.com', password, role: 'AGENT' },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: { name: 'Uma User', email: 'user@example.com', password, role: 'USER' },
  });

  const existingTickets = await prisma.ticket.count();
  if (existingTickets === 0) {
    const t1 = await prisma.ticket.create({
      data: {
        title: 'Cannot access VPN',
        description: 'Getting a timeout error when connecting to the company VPN since this morning.',
        priority: 'HIGH',
        category: 'INTERNET_NETWORK',
        createdById: user.id,
        assignedToId: agent.id,
      },
    });
    await prisma.ticketHistory.create({
      data: { ticketId: t1.id, userId: user.id, action: 'CREATED', description: 'Ticket created by Uma User' },
    });

    const t2 = await prisma.ticket.create({
      data: {
        title: 'Reimbursement not received',
        description: 'Submitted a travel reimbursement 3 weeks ago, still not processed.',
        priority: 'MEDIUM',
        category: 'REQUESTS',
        createdById: user.id,
      },
    });
    await prisma.ticketHistory.create({
      data: { ticketId: t2.id, userId: user.id, action: 'CREATED', description: 'Ticket created by Uma User' },
    });
  }

  console.log('Seed complete:');
  console.log('  Admin: admin@example.com / Password123!');
  console.log('  Agent: agent@example.com / Password123!');
  console.log('  User:  user@example.com  / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
