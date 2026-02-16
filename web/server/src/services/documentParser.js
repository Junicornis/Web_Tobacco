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
                    if (row.every(cell => String(cell ?? '').trim() === '')) continue;

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

        if (rows.length === 1) {
            return { headers: rows[0].map((_, i) => `Column${i + 1}`), dataStartRow: 0 };
        }

        const maxScanRows = Math.min(rows.length, 30);
        const headerKeywordRe = /序号|编号|风险|作业|危险|触发|过程|后果|等级|严重性|可能性|综合评价|分值|控制措施|单位|部门/i;
        const strongHeaderRe = /序号|风险单元|作业活动|危险发生|触发因素|可能导致的后果|现有控制措施|涉及单位|部门/i;

        const toCellStr = (cell) => String(cell ?? '').trim();
        const nonEmptyCount = (row) => row.reduce((acc, cell) => acc + (toCellStr(cell) ? 1 : 0), 0);
        const distinctNonEmptyCount = (row) => {
            const set = new Set();
            for (const cell of row) {
                const s = toCellStr(cell);
                if (s) set.add(s);
            }
            return set.size;
        };

        let bestRowIndex = 0;
        let bestScore = -Infinity;

        for (let i = 0; i < maxScanRows; i++) {
            const row = rows[i] || [];
            const count = nonEmptyCount(row);
            const distinct = distinctNonEmptyCount(row);
            const rowJoined = row.map(toCellStr).filter(Boolean).join(' ');
            const hasKeyword = headerKeywordRe.test(rowJoined);
            const hasStrongHeader = strongHeaderRe.test(rowJoined);

            const firstCellStr = toCellStr(row[0]);
            const firstCellIsNumber = firstCellStr !== '' && !isNaN(Number(firstCellStr));
            let maxLen = 0;
            for (const cell of row) {
                const len = toCellStr(cell).length;
                if (len > maxLen) maxLen = len;
            }

            let score = count * 2 + distinct;
            if (count <= 1) score -= 10;
            if (hasKeyword) score += 15;
            if (hasStrongHeader) score += 120;
            if (firstCellIsNumber) score -= 18;
            if (maxLen >= 40) score -= 12;

            if (score > bestScore) {
                bestScore = score;
                bestRowIndex = i;
            }
        }

        const headerRow = rows[bestRowIndex] || [];
        const headers = headerRow.map((cell, i) => {
            const s = toCellStr(cell);
            return s ? s : `Column${i + 1}`;
        });

        let dataStartRow = Math.min(bestRowIndex + 1, rows.length);
        const maybeSubHeader = rows[dataStartRow] || [];
        const maybeSubHeaderJoined = maybeSubHeader.map(toCellStr).filter(Boolean).join(' ');
        if ((toCellStr(maybeSubHeader[0]) === '') && /岗位|区域|严重性|可能性|综合评价|分值/i.test(maybeSubHeaderJoined)) {
            dataStartRow = Math.min(dataStartRow + 1, rows.length);
        }

        return { headers, dataStartRow };
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
                return val ? `${header}: ${val}` : null;
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
