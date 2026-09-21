import { Injectable, Inject } from '@nestjs/common';
import { Db } from '../../common/db.js';
@Injectable()
export class ProjectRepository {
  constructor(@Inject(Db) readonly db: Db) {}
}
