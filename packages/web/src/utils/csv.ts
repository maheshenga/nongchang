// CSV 导出工具:正确转义 + UTF-8 BOM(Excel 直接打开不乱码) + 浏览器下载。
// 用于全域批次追踪的「数据报表下发(Excel)」「极速出具报告」真实导出。

/** 单元格转义:含逗号/引号/换行时用双引号包裹,内部引号翻倍。 */
function escapeCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 行数组 → CSV 文本(不含 BOM)。 */
export function toCSV(rows: Array<Array<unknown>>): string {
  return rows.map(row => row.map(escapeCell).join(',')).join('\r\n');
}

/** 触发浏览器下载一个 UTF-8 BOM 的 CSV 文件。 */
export function downloadCSV(filename: string, rows: Array<Array<unknown>>): void {
  const csv = toCSV(rows);
  // \uFEFF BOM 让 Excel 以 UTF-8 解析,避免中文乱码。
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
