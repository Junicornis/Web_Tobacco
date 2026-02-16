/**
 * 文档解析服务
 * 支持 Excel、Word、PDF、TXT 文件的解析
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

class DocumentParser {
    /**
     * 解析文档主入口
     * @param {string} filePath - 文件路径
     * @param {string} fileType - 文件类型 (excel/word/pdf/txt)
     * @returns {Promise<Object>} 解析结果
     */
    async parse(filePath, fileType) {
        switch (fileType) {
            case 'excel':
                return await this.parseExcel(filePath);
            case 'word':
                return await this.parseWord(filePath);
            case 'pdf':
                return await this.parsePDF(filePath);
            case 'txt':
                return await this.parseTxt(filePath);
            default:
                throw new Error(`不支持的文件类型: ${fileType}`);
        }
    }

    /**
     * 解析 Excel 文件
     */
    async parseExcel(filePath) {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheets = [];
            let totalRows = 0;

            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                
                if (rawData.length === 0) return;

                // 智能表头识别
                const { headers, dataStartRow } = this._detectHeaders(rawData);
                
                // 转换数据
                const data = [];
                for (let i = dataStartRow; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue; // 跳过空行
                    
                    const rowData = {};
                    headers.forEach((header, idx) => {
                        if (header && row[idx] !== undefined) {
                            rowData[header] = this._normalizeCellValue(row[idx]);
                        }
                    });
                    
                    if (Object.keys(rowData).length > 0) {
                        data.push(rowData);
                    }
                }

                sheets.push({
                    name: sheetName,
                    headers: headers.filter(h => h),
                    rowCount: data.length,
                    data: data,
                    rawText: this._sheetToText(sheetName, headers, data)
                });

                totalRows += data.length;
            });

            const combinedText = sheets.map(s => s.rawText).join('\n\n');

            return {
                type: 'excel',
                sheetCount: sheets.length,
                totalRows: totalRows,
                sheets: sheets,
                text: combinedText,
                preview: combinedText.substring(0, 2000)
            };
        } catch (error) {
            throw new Error(`Excel解析失败: ${error.message}`);
        }
    }

    /**
     * 解析 Word 文件
     */
    async parseWord(filePath) {
        try {
            // 使用 mammoth 提取文本并保留结构
            const mammoth = require('mammoth');
            
            const result = await mammoth.extractRawText({
                path: filePath,
                // 保留一些格式信息
                preserveEmptyParagraphs: true
            });

            // 尝试获取文档结构
            const structure = await this._extractWordStructure(filePath);

            const text = result.value;
            const paragraphs = text.split(/\n+/).filter(p => p.trim());

            return {
                type: 'word',
                pageCount: structure.pageCount || Math.ceil(paragraphs.length / 30),
                paragraphCount: paragraphs.length,
                structure: structure,
                text: text,
                preview: text.substring(0, 2000)
            };
        } catch (error) {
            // 如果 mammoth 失败，回退到简单文本提取
            try {
                const text = fs.readFileSync(filePath, 'utf8');
                // 清理 Word 二进制文件中的乱码
                const cleanText = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
                return {
                    type: 'word',
                    pageCount: 1,
                    text: cleanText,
                    preview: cleanText.substring(0, 2000)
                };
            } catch {
                throw new Error(`Word解析失败: ${error.message}`);
            }
        }
    }

    /**
     * 解析 PDF 文件
     */
    async parsePDF(filePath) {
        try {
            const pdfParse = require('pdf-parse');
            const pdfBuffer = fs.readFileSync(filePath);
            
            const result = await pdfParse(pdfBuffer, {
                max: 0 // 解析所有页面
            });

            const text = result.text;
            const pages = result.numpages;

            // 如果需要 OCR 识别图片中的文字
            // 这里简化处理，实际项目可以集成 tesseract.js 或调用外部 OCR 服务
            let ocrText = '';
            if (process.env.ENABLE_PDF_OCR === 'true') {
                ocrText = await this._extractPDFOCR(filePath);
            }

            return {
                type: 'pdf',
                pageCount: pages,
                text: text + '\n' + ocrText,
                hasImages: result.info?.PDFFormatVersion !== undefined,
                preview: text.substring(0, 2000)
            };
        } catch (error) {
            throw new Error(`PDF解析失败: ${error.message}`);
        }
    }

    /**
     * 解析 TXT 文件
     */
    async parseTxt(filePath) {
        try {
            // 尝试不同的编码
            let text = '';
            const encodings = ['utf8', 'utf-8', 'gbk', 'gb2312', 'gb18030', 'latin1'];
            
            for (const encoding of encodings) {
                try {
                    text = fs.readFileSync(filePath, { encoding });
                    // 检查是否解码成功（简单判断：没有大量�字符）
                    if (!text.includes('�') || text.replace(/�/g, '').length / text.length > 0.95) {
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // 统一换行符
            text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            
            const lines = text.split('\n').filter(line => line.trim());

            return {
                type: 'txt',
                lineCount: lines.length,
                encoding: 'utf8', // 实际使用的编码
                text: text,
                preview: text.substring(0, 2000)
            };
        } catch (error) {
            throw new Error(`TXT解析失败: ${error.message}`);
        }
    }

    /**
     * 智能表头识别
     */
    _detectHeaders(rows) {
        if (rows.length === 0) {
            return { headers: [], dataStartRow: 0 };
        }

        // 如果只有一行，直接作为数据
        if (rows.length === 1) {
            return { headers: rows[0].map((_, i) => `Column${i + 1}`), dataStartRow: 0 };
        }

        const normalizeHeaderCell = (cell, fallback) => {
            const v = String(cell ?? '').replace(/\s+/g, ' ').trim();
            return v || fallback;
        };

        const isRowMostlyTitle = (row) => {
            if (!Array.isArray(row)) return true;
            const nonEmpty = row.filter(c => String(c ?? '').trim() !== '');
            if (nonEmpty.length === 0) return true;
            if (row.length <= 2 && nonEmpty.length <= 2) {
                const t = String(nonEmpty[0] ?? '').trim();
                if (t.length >= 8) return true;
                if (/表|目录|清单|汇总/.test(t)) return true;
            }
            return false;
        };

        if (isRowMostlyTitle(rows[0]) && Array.isArray(rows[1]) && rows[1].length >= 4) {
            const hdr = rows[1];
            const sub = rows[2];
            const hasSub = Array.isArray(sub) && sub.length > 0;
            const subNonEmpty = hasSub ? sub.filter(c => String(c ?? '').trim() !== '') : [];
            const hasLikelySub = hasSub && subNonEmpty.length >= 2 && subNonEmpty.length / Math.max(sub.length, 1) <= 0.6;
            const filled = [];
            let last = '';
            hdr.forEach((cell, i) => {
                const raw = String(cell ?? '').replace(/\s+/g, ' ').trim();
                if (raw) last = raw;
                filled[i] = raw || last || `Column${i + 1}`;
            });
            const merged = filled.map((base, i) => {
                if (!hasLikelySub) return base;
                const subCell = String(sub[i] ?? '').replace(/\s+/g, ' ').trim();
                if (!subCell) return base;
                if (subCell === base) return base;
                return `${base}-${subCell}`;
            });
            const unique = [];
            const seen = new Map();
            merged.forEach((h, idx) => {
                const key = String(h || `Column${idx + 1}`).trim() || `Column${idx + 1}`;
                const count = (seen.get(key) || 0) + 1;
                seen.set(key, count);
                unique.push(count === 1 ? key : `${key}_${count}`);
            });
            return { headers: unique, dataStartRow: 1 + (hasLikelySub ? 2 : 1) };
        }

        const scoreRowAsHeader = (row, nextRow) => {
            const cells = Array.isArray(row) ? row : [];
            const colCount = cells.length;
            const nonEmptyCells = cells.filter(c => String(c ?? '').trim() !== '');
            const nonEmptyCount = nonEmptyCells.length;
            if (colCount === 0 || nonEmptyCount === 0) return -1;

            const stringCount = nonEmptyCells.filter(c => isNaN(Number(String(c).trim()))).length;
            const stringRatio = stringCount / nonEmptyCount;
            const avgLen = nonEmptyCells.reduce((s, c) => s + String(c ?? '').trim().length, 0) / nonEmptyCount;
            const longCellCount = nonEmptyCells.filter(c => String(c ?? '').trim().length >= 20).length;

            const keywordHits = nonEmptyCells.reduce((n, c) => {
                const t = String(c ?? '').trim();
                if (!t) return n;
                if (/序号|风险|单元|作业|活动|危险|触发|过程|后果|控制|措施|部门|等级|评价|分值|严重性|可能性/.test(t)) {
                    return n + 1;
                }
                return n;
            }, 0);

            let penalty = 0;
            if (colCount <= 2 && avgLen >= 10) penalty += 3;
            if (colCount <= 2 && /表|目录|清单|汇总/.test(String(nonEmptyCells[0] ?? ''))) penalty += 2;
            penalty += Math.min(longCellCount, 6);
            const firstNonEmpty = nonEmptyCells[0];
            if (firstNonEmpty !== undefined) {
                const s = String(firstNonEmpty).trim();
                if (s && !isNaN(Number(s))) penalty += 3;
            }

            let nextHasNumeric = 0;
            if (nextRow && Array.isArray(nextRow)) {
                nextHasNumeric = nextRow.some(c => {
                    const s = String(c ?? '').trim();
                    if (!s) return false;
                    return !isNaN(Number(s));
                }) ? 1 : 0;
            }

            const base = Math.min(colCount, 40) + nonEmptyCount;
            return base + (stringRatio >= 0.6 ? 3 : 0) + nextHasNumeric + Math.min(keywordHits, 6) - penalty;
        };

        const scanLimit = Math.min(rows.length, 8);
        let bestIdx = 0;
        let bestScore = -1;
        for (let i = 0; i < scanLimit; i++) {
            const s = scoreRowAsHeader(rows[i], rows[i + 1]);
            if (s > bestScore) {
                bestScore = s;
                bestIdx = i;
            }
        }

        const headerRow = rows[bestIdx] || [];
        const nextRow = rows[bestIdx + 1] || [];

        const hasLikelySubHeader = (() => {
            if (!Array.isArray(nextRow) || nextRow.length === 0) return false;
            const nonEmpty = nextRow.filter(c => String(c ?? '').trim() !== '');
            if (nonEmpty.length < 2) return false;
            const mostlyEmpty = nonEmpty.length / Math.max(nextRow.length, 1) <= 0.6;
            const mostlyString = nonEmpty.filter(c => isNaN(Number(String(c).trim()))).length / nonEmpty.length >= 0.8;
            return mostlyEmpty && mostlyString;
        })();

        const filledBaseHeaders = [];
        let lastBase = '';
        headerRow.forEach((cell, i) => {
            const raw = String(cell ?? '').replace(/\s+/g, ' ').trim();
            if (raw) lastBase = raw;
            filledBaseHeaders[i] = raw || lastBase || `Column${i + 1}`;
        });

        const mergedHeaders = filledBaseHeaders.map((base, i) => {
            if (!hasLikelySubHeader) return base;
            const sub = normalizeHeaderCell(nextRow[i], '');
            if (!sub) return base;
            if (sub === base) return base;
            return `${base}-${sub}`;
        });

        const uniqueHeaders = [];
        const seen = new Map();
        mergedHeaders.forEach((h, idx) => {
            const key = String(h || `Column${idx + 1}`).trim() || `Column${idx + 1}`;
            const count = (seen.get(key) || 0) + 1;
            seen.set(key, count);
            uniqueHeaders.push(count === 1 ? key : `${key}_${count}`);
        });

        return {
            headers: uniqueHeaders,
            dataStartRow: bestIdx + (hasLikelySubHeader ? 2 : 1)
        };
    }

    /**
     * 规范化单元格值
     */
    _normalizeCellValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'number') {
            return value;
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        return String(value).trim();
    }

    /**
     * 将 Sheet 转换为文本表示
     */
    _sheetToText(sheetName, headers, data) {
        let text = `[Sheet: ${sheetName}]\n`;
        text += `表头: ${headers.join(', ')}\n`;
        text += `数据行数: ${data.length}\n\n`;
        
        // 增加提取行数限制，支持更多数据
        // GLMClient 会处理文本分块，所以这里可以提供更多数据
        const maxRows = 2000;
        const previewRows = data.slice(0, maxRows);
        
        previewRows.forEach((row, idx) => {
            text += `[行${idx + 1}] `;
            // 优化格式，使其更易读
            const entries = headers.map(header => {
                const val = row[header];
                if (val === null || val === undefined) return null;
                const s = typeof val === 'string' ? val.trim() : String(val);
                return s ? `${header}: ${s}` : null;
            }).filter(Boolean);
            text += entries.join(' | ') + '\n\n'; // 使用双换行符，以便分块逻辑将其视为独立段落
        });

        if (data.length > maxRows) {
            text += `... 还有 ${data.length - maxRows} 行数据 ...\n`;
        }

        return text;
    }

    /**
     * 提取 Word 文档结构
     */
    async _extractWordStructure(filePath) {
        try {
            // 这里可以集成更复杂的结构提取
            // 目前简化处理
            return {
                headings: [],
                tables: [],
                pageCount: 0
            };
        } catch (error) {
            return { headings: [], tables: [], pageCount: 0 };
        }
    }

    /**
     * PDF OCR 识别（预留接口）
     */
    async _extractPDFOCR(filePath) {
        // 实际项目中可以集成 OCR 服务
        // 例如：Tesseract.js、百度OCR、腾讯OCR等
        console.log('PDF OCR 识别暂未启用');
        return '';
    }

    /**
     * 检测文件类型
     */
    detectFileType(filename) {
        const ext = path.extname(filename).toLowerCase();
        const typeMap = {
            '.xlsx': 'excel',
            '.xls': 'excel',
            '.docx': 'word',
            '.doc': 'word',
            '.pdf': 'pdf',
            '.txt': 'txt'
        };
        return typeMap[ext] || null;
    }

    /**
     * 获取文件统计信息
     */
    async getFileStats(filePath) {
        const stats = fs.statSync(filePath);
        return {
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
        };
    }
}

module.exports = new DocumentParser();
