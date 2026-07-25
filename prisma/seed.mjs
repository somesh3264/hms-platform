// Seeds a demo hospital with a front-desk user and a doctor, so the
// front-desk module (and src/shared/dev-session.ts, its temporary stand-in
// for real auth) has something to resolve against locally. Not meant to
// represent production data.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.hospital.findFirst({ where: { name: 'Demo Hospital' } });
  if (existing) {
    console.log('Demo Hospital already seeded, skipping.');
    return;
  }

  const hospital = await prisma.hospital.create({
    data: { name: 'Demo Hospital', status: 'ACTIVE' },
  });

  // No auth module exists yet (FR-2.4) -- these are not real password
  // hashes, just placeholders so the User rows are creatable.
  await prisma.user.createMany({
    data: [
      {
        hospitalId: hospital.id,
        name: 'Priya Sharma',
        email: 'frontdesk@demo.hospital',
        passwordHash: 'seed-placeholder-not-a-real-hash',
        role: 'FRONT_DESK',
      },
      {
        hospitalId: hospital.id,
        name: 'Dr. Rao',
        email: 'doctor@demo.hospital',
        passwordHash: 'seed-placeholder-not-a-real-hash',
        role: 'DOCTOR',
      },
    ],
  });

  console.log(`Seeded Demo Hospital (${hospital.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
