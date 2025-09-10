import * as dotenv from 'dotenv';
dotenv.config();
import { DataSource, Repository } from 'typeorm';
import { runSeeder } from './seed';

async function bootstrap() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: true,
  });

  await dataSource.initialize();
  await runSeeder(dataSource);

  await dataSource.destroy();
}

bootstrap().catch(error => {
  console.error('Error during seeding:', error);
  process.exit(1);
});
