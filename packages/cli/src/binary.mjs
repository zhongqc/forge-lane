import skillPath from '../skills/forge-task/SKILL.md' with { type: 'file' };

globalThis.__forgeEmbeddedSkillPath = skillPath;
await import('./forge.mjs');
