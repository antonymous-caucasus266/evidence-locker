import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed app keys for demo
  console.log('Seeding database...');
  
  // Note: In a real implementation, you'd store these securely
  // For demo purposes, we're just logging them
  const appKeys = {
    'registry': 'registry-demo-key-12345',
    'issuer-portal': 'issuer-portal-demo-key-67890',
    'verifier-console': 'verifier-console-demo-key-abcde'
  };
  
  console.log('Demo app keys created:');
  Object.entries(appKeys).forEach(([app, key]) => {
    console.log(`${app}: ${key}`);
  });
  
  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
