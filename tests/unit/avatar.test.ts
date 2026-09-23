import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameAvatar } from '../../packages/shared/src/avatar.ts';

await test('name avatars support Chinese names, English initials and complete Unicode characters', () => {
  assert.equal(nameAvatar('林予安').initials, '予安');
  assert.equal(nameAvatar('李雷').initials, '李雷');
  assert.equal(nameAvatar(' Ada   Lovelace ').initials, 'AL');
  assert.equal(nameAvatar('Alice').initials, 'AL');
  assert.equal(nameAvatar('👩‍💻').initials, '👩‍💻');
  assert.equal(nameAvatar(' ').initials, '?');
  assert.deepEqual(nameAvatar('Ada Lovelace'), nameAvatar(' Ada  Lovelace '));
  assert.deepEqual(nameAvatar('é'), nameAvatar('e\u0301'));
  assert.match(nameAvatar('林予安').color, /^#[0-9a-f]{6}$/);
});
