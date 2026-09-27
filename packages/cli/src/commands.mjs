export const commands = {
  login: {
    args: 0,
    options: 'email workspace password-stdin token-stdin read-only name expires-in-days',
    usage: 'forge login --server URL --email EMAIL --project APP [--password-stdin]',
    description: '登录并签发项目范围令牌；密码不会写入配置',
  },
  logout: {
    args: 0,
    options: 'local',
    usage: 'forge logout [--local]',
    description: '撤销当前令牌并清理本地登录；--local 仅清理本地',
  },
  whoami: { args: 0, options: '', usage: 'forge whoami', description: '查看当前用户、工作区和令牌权限' },
  'token list': {
    args: 0,
    options: '',
    usage: 'forge token list',
    description: '列出自己签发的令牌，不返回密钥',
  },
  'token revoke': {
    args: 1,
    options: '',
    usage: 'forge token revoke TOKEN_ID',
    description: '撤销自己的指定令牌',
  },
  'config show': {
    args: 0,
    options: '',
    usage: 'forge config show',
    description: '显示配置及登录状态，隐藏令牌',
  },
  'config set': {
    args: 2,
    options: '',
    usage: 'forge config set <server|project> VALUE',
    description: '配置默认地址或项目；更换地址清除本地令牌',
  },
  'project list': { args: 0, options: '', usage: 'forge project list', description: '列出有权访问的项目' },
  'project show': { args: 1, options: '', usage: 'forge project show APP', description: '查看项目信息' },
  'status list': {
    args: 0,
    options: '',
    usage: 'forge status list --project APP',
    description: '查看工作流状态名称与ID',
  },
  'member list': {
    args: 0,
    options: '',
    usage: 'forge member list --project APP',
    description: '查看可分配成员名称与ID',
  },
  'label list': {
    args: 0,
    options: '',
    usage: 'forge label list --project APP',
    description: '查看项目标签',
  },
  'sprint list': {
    args: 0,
    options: '',
    usage: 'forge sprint list --project APP',
    description: '查看迭代及其状态',
  },
  'issue list': {
    args: 0,
    options: 'status assigned-to type priority sprint epic search limit offset all',
    usage: 'forge issue list --project APP [--status Ready] [--assigned-to me] [--all]',
    description: '筛选事项，默认返回100条及总数',
  },
  'issue show': {
    args: 1,
    options: '',
    usage: 'forge issue show APP-123',
    description: '读取完整事项及当前版本',
  },
  'issue context': {
    args: 1,
    options: '',
    usage: 'forge issue context APP-123',
    description: '获取开发上下文：需求、关系、评论、活动、状态、开发关联和执行记录',
  },
  'issue create': {
    args: 0,
    options:
      'title type description-file status priority assignee epic parent sprint estimate labels idempotency-key',
    usage: 'forge issue create --project APP --type task --title TITLE [--description-file spec.md]',
    description: '创建事项；子任务通过 --type subtask --parent APP-123',
  },
  'issue update': {
    args: 1,
    options:
      'title type description-file status priority assignee epic parent sprint estimate labels if-version idempotency-key',
    usage: 'forge issue update APP-123 [--description-file spec.md] [--if-version 3]',
    description: '修改字段，支持版本检查；可空字段用 none 清除',
  },
  'issue transition': {
    args: 1,
    options: 'to if-version idempotency-key',
    usage: 'forge issue transition APP-123 --to "Code Review" [--if-version 3]',
    description: '按精确状态名或ID流转',
  },
  'issue assign': {
    args: 1,
    options: 'to if-version idempotency-key',
    usage: 'forge issue assign APP-123 --to <me|none|NAME|ID>',
    description: '修改负责人',
  },
  'issue comment': {
    args: 1,
    options: 'body-file idempotency-key',
    usage: 'forge issue comment APP-123 --body-file result.md',
    description: '添加评论；文件路径 - 读取标准输入',
  },
  'issue comments': {
    args: 1,
    options: '',
    usage: 'forge issue comments APP-123',
    description: '查看最近评论（服务端上限200条）',
  },
  'issue history': {
    args: 1,
    options: 'cursor all',
    usage: 'forge issue history APP-123 [--cursor ID|--all]',
    description: '查看活动历史，默认50条并返回下一页游标',
  },
  'issue revisions': {
    args: 1,
    options: 'revision',
    usage: 'forge issue revisions APP-123 [--revision ID]',
    description: '查看最近100个描述版本，或读取指定版本',
  },
  'issue development': {
    args: 1,
    options: '',
    usage: 'forge issue development APP-123',
    description: '查看关联PR和提交（各最近100条）',
  },
  'issue claim': {
    args: 1,
    options: 'executor lease-minutes if-version idempotency-key',
    usage: 'forge issue claim APP-123 [--executor codex] [--lease-minutes 30] [--if-version 3]',
    description: '领取任务租约，返回执行ID；不修改负责人或工作流状态',
  },
  'issue release': {
    args: 1,
    options: 'summary-file idempotency-key',
    usage: 'forge issue release APP-123 [--summary-file reason.md]',
    description: '取消当前令牌持有的运行租约',
  },
  'run list': {
    args: 0,
    options: 'issue cursor limit all status',
    usage: 'forge run list [--project APP] [--issue APP-123] [--status RUNNING] [--all]',
    description: '查看有权访问的执行记录',
  },
  'run show': {
    args: 1,
    options: '',
    usage: 'forge run show RUN_ID',
    description: '查看执行状态、租约与结果',
  },
  'run renew': {
    args: 1,
    options: 'lease-minutes if-version idempotency-key',
    usage: 'forge run renew RUN_ID [--lease-minutes 30] [--if-version 1]',
    description: '续期本令牌持有的活动租约',
  },
  'run finish': {
    args: 1,
    options: 'outcome summary-file pr-url if-version idempotency-key',
    usage: 'forge run finish RUN_ID --outcome succeeded --summary-file result.md [--pr-url URL]',
    description: '记录成功/失败/取消及总结；不会自动把事项标成Done',
  },
  'skill print': {
    args: 0,
    options: '',
    usage: 'forge skill print',
    description: '输出Forge Lane CLI的Codex SKILL.md模板',
  },
};
export const stringOptions =
  'server project email workspace name expires-in-days status assigned-to type priority sprint epic search limit offset title description-file assignee parent estimate labels if-version idempotency-key to body-file cursor revision executor lease-minutes issue outcome summary-file pr-url'.split(
    ' ',
  );
export const booleanOptions = 'json help version password-stdin token-stdin read-only local all'.split(' ');
export function help(command) {
  const c = commands[command];
  if (c)
    return `${c.usage}\n\n${c.description}\n\n选项：${c.options
      .split(' ')
      .filter(Boolean)
      .map((k) => '--' + k)
      .join(' ')}\n全局：--server URL --project KEY --json --help\n`;
  return `Forge Lane CLI 0.1.0\n\n${Object.values(commands)
    .map((c) => `${c.usage}\n  ${c.description}`)
    .join(
      '\n',
    )}\n\n全局：--server URL --project KEY --json --help --version\n环境：FORGE_SERVER、FORGE_TOKEN、FORGE_PROJECT、FORGE_CONFIG_DIR\n文件参数支持 - 从标准输入读取。认证密码不能放在命令行参数中。\n`;
}
