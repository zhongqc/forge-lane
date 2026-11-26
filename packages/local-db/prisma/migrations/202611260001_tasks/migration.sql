ALTER TABLE Project ADD COLUMN description TEXT NOT NULL DEFAULT '';
CREATE TABLE Task (
 id TEXT NOT NULL PRIMARY KEY, projectId TEXT NOT NULL, number INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('CODE','MANUAL','GROUP')), parentId TEXT,
 title TEXT NOT NULL, description TEXT NOT NULL, acceptanceCriteria TEXT NOT NULL,
 priority TEXT NOT NULL, labels JSONB NOT NULL, status TEXT NOT NULL,
 position INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, requirementRevisionId TEXT NOT NULL,
 archived BOOLEAN NOT NULL DEFAULT false, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL,
 FOREIGN KEY(projectId) REFERENCES Project(id) ON DELETE RESTRICT,
 FOREIGN KEY(projectId,parentId) REFERENCES Task(projectId,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX Task_projectId_number_key ON Task(projectId,number);
CREATE UNIQUE INDEX Task_projectId_id_key ON Task(projectId,id);
CREATE INDEX Task_projectId_status_position_idx ON Task(projectId,status,position);
CREATE TABLE TaskDependency (
 projectId TEXT NOT NULL, taskId TEXT NOT NULL, dependsOnId TEXT NOT NULL,
 PRIMARY KEY(taskId,dependsOnId),
 CHECK(taskId <> dependsOnId),
 FOREIGN KEY(projectId,taskId) REFERENCES Task(projectId,id) ON DELETE RESTRICT,
 FOREIGN KEY(projectId,dependsOnId) REFERENCES Task(projectId,id) ON DELETE RESTRICT
);
CREATE TABLE TaskRevision (
 id TEXT NOT NULL PRIMARY KEY, taskId TEXT NOT NULL, title TEXT NOT NULL,
 description TEXT NOT NULL, acceptanceCriteria TEXT NOT NULL, dependencies JSONB NOT NULL,
 author TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(taskId) REFERENCES Task(id) ON DELETE RESTRICT
);
CREATE INDEX TaskRevision_taskId_createdAt_idx ON TaskRevision(taskId,createdAt);
