// Проставляет иллюстрации деталям в рабочей базе, не трогая остальные данные (заказы, остатки).
// Запуск: npm run db:images
import { PrismaClient } from '@prisma/client';
import { partImageUrl } from '../prisma/seed';

const prisma = new PrismaClient();

async function main() {
  const parts = await prisma.part.findMany({ select: { id: true, manufacturerPartNumber: true, imageUrl: true } });
  let updated = 0;
  for (const p of parts) {
    if (!p.manufacturerPartNumber) continue;
    const url = partImageUrl(p.manufacturerPartNumber);
    if (p.imageUrl === url) continue;
    await prisma.part.update({ where: { id: p.id }, data: { imageUrl: url } });
    updated++;
  }
  console.log(`Иллюстрации проставлены: ${updated} из ${parts.length} запчастей.`);
}

main().finally(() => prisma.$disconnect());
