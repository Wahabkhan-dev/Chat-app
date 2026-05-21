const { PrismaClient } = require('../generated/prisma');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@mawbytec.com';
  const password = 'admin123';

  const hashed = bcrypt.hashSync(password, 10);

  const user = await prisma.users.upsert({
    where: { email },
    update: {
      password: hashed,
      name: 'Mawby Admin',
      role: 'admin',
      is_active: true,
      updated_at: new Date()
    },
    create: {
      name: 'Mawby Admin',
      email,
      password: hashed,
      role: 'admin',
      is_active: true
    }
  });

  // Ensure default settings exist
  await prisma.user_settings.upsert({
    where: { user_id: user.id },
    update: {},
    create: { user_id: user.id }
  });

  console.log('Admin user created/updated:', { id: user.id, email: user.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
