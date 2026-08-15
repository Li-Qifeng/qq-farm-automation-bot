import chalk from 'chalk';

export function formatTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => String(r[i] || '').length))
  );

  const line = (row: string[]) =>
    '│ ' + row.map((v, i) => String(v || '').padEnd(colWidths[i])).join(' │ ') + ' │';

  const sep = (c: string) =>
    c + colWidths.map(w => '─'.repeat(w + 2)).join(c) + c;

  const out: string[] = [];
  out.push(sep('┌'));
  out.push(line(headers));
  out.push(sep('├'));
  for (const row of rows) out.push(line(row));
  out.push(sep('└'));
  return out.join('\n');
}

export function formatJson(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function formatSimple(items: Record<string, any>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(items)) {
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    out.push(`${chalk.bold(k)}: ${val}`);
  }
  return out.join('\n');
}

export function formatAutomationStatus(automation: Record<string, any>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(automation)) {
    const icon = v ? chalk.green('✅') : chalk.gray('⬜');
    out.push(`  ${icon} ${k}: ${v}`);
  }
  return out.join('\n');
}

export function formatFarmStatus(status: any): string {
  const out: string[] = [];
  if (status.name) out.push(`  ${chalk.bold('昵称')}: ${status.name} Lv${status.level}`);
  if (status.gold !== undefined) out.push(`  ${chalk.bold('金币')}: ${Number(status.gold).toLocaleString()}`);
  if (status.goldBean !== undefined) out.push(`  ${chalk.bold('金豆')}: ${Number(status.goldBean).toLocaleString()}`);
  if (status.coupon !== undefined) out.push(`  ${chalk.bold('点券')}: ${Number(status.coupon).toLocaleString()}`);
  if (status.exp !== undefined) out.push(`  ${chalk.bold('经验')}: ${Number(status.exp).toLocaleString()}`);
  return out.join('\n');
}

export function formatConnected(connected: boolean): string {
  return connected ? chalk.green('✅ 已连接') : chalk.red('❌ 已断开');
}

export function formatTime(ts: number | string): string {
  if (typeof ts === 'number') return new Date(ts).toLocaleString();
  return ts;
}

export function printSuccess(msg: string) {
  console.log(chalk.green('✓'), msg);
}

export function printError(msg: string) {
  console.error(chalk.red('✗'), msg);
}

export function printInfo(msg: string) {
  console.log(chalk.blue('ℹ'), msg);
}

export function printWarn(msg: string) {
  console.log(chalk.yellow('⚠'), msg);
}