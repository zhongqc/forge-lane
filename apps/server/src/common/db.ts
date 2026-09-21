import { Injectable, Global, Module } from '@nestjs/common';
import { createDatabase } from '../../../../packages/db/src/client.js';
@Injectable()
export class Db {
  readonly client = createDatabase();
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
@Global()
@Module({ providers: [Db], exports: [Db] })
export class DatabaseModule {}
