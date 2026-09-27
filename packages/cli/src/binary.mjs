import skillPath from '../skills/forge-cli/SKILL.md' with { type: 'file' };

globalThis.__forgeEmbeddedSkillPath = skillPath;
await import('./forge.mjs');
