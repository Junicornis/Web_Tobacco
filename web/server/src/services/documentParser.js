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
                const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (rawData.length === 0) return;

                // 智能表头识别
                const { headers, dataStartRow } = this._detectHeaders(rawData);
                
                // 转换数据
                const data = [];
                for (let i = dataStartRow; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (row.every(cell => !cell)) continue; // 跳过空行
                    
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

        // 启发式规则：
        // 1. 第一行通常是表头
        // 2. 表头通常是字符串，而数据可能包含数字
        // 3. 表头通常较短
        
        const firstRow = rows[0];
        const secondRow = rows[1];

        // 检查第一行是否像表头
        const looksLikeHeader = firstRow.every((cell, idx) => {
            const cellStr = String(cell || '').trim();
            const secondCell = secondRow[idx];
            
            // 如果第一行是字符串，第二行是数字，很可能是表头
            if (cellStr && secondCell !== undefined) {
                const isFirstString = isNaN(Number(cellStr));
                const isSecondNumber = !isNaN(Number(secondCell));
                return isFirstString || !isSecondNumber;
            }
            return true;
        });

        if (looksLikeHeader) {
            return {
                headers: firstRow.map((cell, i) => String(cell || `Column${i + 1}`).trim()),
                dataStartRow: 1
            };
        }

        // 默认生成列名
        return {
            headers: firstRow.map((_, i) => `Column${i + 1}`),
            dataStartRow: 0
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
