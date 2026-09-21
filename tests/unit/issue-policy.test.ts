import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertIssueShape } from '../../apps/server/src/modules/issue/domain/issue.policy.ts';
void test('Epic cannot enter Sprint or have estimate', () => {
  assert.throws(() => assertIssueShape({ type: 'EPIC', sprintId: 's' }), /Epic/);
  assert.throws(() => assertIssueShape({ type: 'EPIC', estimate: 0 }), /Epic/);
});
void test('Subtask requires a parent and inherits sprint and epic', () => {
  assert.throws(() => assertIssueShape({ type: 'SUBTASK' }), /父事项/);
  assert.throws(() => assertIssueShape({ type: 'SUBTASK', parentId: 'p', sprintId: 's' }), /继承/);
  assert.doesNotThrow(() => assertIssueShape({ type: 'SUBTASK', parentId: 'p' }));
});
void test('ordinary issues cannot have parents; zero estimate is valid', () => {
  assert.throws(() => assertIssueShape({ type: 'STORY', parentId: 'p' }), /父事项/);
  assert.doesNotThrow(() => assertIssueShape({ type: 'TASK', estimate: 0 }));
  assert.throws(() => assertIssueShape({ type: 'BUG', estimate: -1 }), /估点/);
});
