import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuick } from '../../packages/shared/src/filters.ts';
void test('type choices use OR, with other fields combined using AND', () => {
  const story = { type: 'STORY', assigneeId: 'me', priority: 'HIGH', estimate: 0 };
  assert.equal(matchesQuick(story, ['STORY', 'TASK', 'mine'], 'me'), true);
  assert.equal(matchesQuick({ ...story, type: 'BUG' }, ['STORY', 'TASK'], 'me'), false);
  assert.equal(matchesQuick(story, ['STORY', 'noestimate'], 'me'), false);
});
