import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ExternalHyperlink,
} from 'docx';

// Font configuration for Word documents
const WORD_FONT = 'Meiryo UI';

/**
 * Create a Word table from rows
 */
function createWordTable(rows: string[][]): Table {
  if (rows.length === 0) {
    return new Table({ rows: [] });
  }

  const tableRows = rows.map((row, rowIndex) => {
    const cells = row.map((cellText) => {
      return new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: cellText,
                font: WORD_FONT,
                size: 20,
                bold: rowIndex === 0,
              }),
            ],
          }),
        ],
        width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
      });
    });

    return new TableRow({
      children: cells,
    });
  });

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Parse text with bold markers (**text**) and links [text](url)
 */
function parseInlineFormatting(text: string): (TextRun | ExternalHyperlink)[] {
  const children: (TextRun | ExternalHyperlink)[] = [];

  // Combined regex for links and bold text
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      children.push(
        new TextRun({
          text: text.substring(lastIndex, match.index),
          font: WORD_FONT,
        })
      );
    }

    const matchedText = match[0];

    // Check if it's bold text
    if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
      children.push(
        new TextRun({
          text: matchedText.slice(2, -2),
          font: WORD_FONT,
          bold: true,
        })
      );
    }
    // Check if it's a link
    else if (matchedText.startsWith('[')) {
      const linkMatch = matchedText.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const [, linkText, url] = linkMatch;
        children.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text: linkText,
                font: WORD_FONT,
                style: 'Hyperlink',
              }),
            ],
            link: url,
          })
        );
      }
    }

    lastIndex = match.index + matchedText.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    children.push(
      new TextRun({
        text: text.substring(lastIndex),
        font: WORD_FONT,
      })
    );
  }

  // If no formatting found, return the whole text
  if (children.length === 0) {
    children.push(new TextRun({ text, font: WORD_FONT }));
  }

  return children;
}

/**
 * Convert Markdown content to Word document buffer
 */
export async function convertMarkdownToWord(
  markdown: string,
  title: string
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Add title
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: title, font: WORD_FONT, size: 32, bold: true }),
      ],
      heading: HeadingLevel.TITLE,
      spacing: { after: 400 },
    })
  );

  const lines = markdown.split('\n');
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      if (inTable && tableRows.length > 0) {
        children.push(createWordTable(tableRows));
        tableRows = [];
        inTable = false;
      }
      children.push(
        new Paragraph({ children: [new TextRun({ text: '', font: WORD_FONT })] })
      );
      continue;
    }

    // Check for table row (starts with |)
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
      // Skip separator rows (| --- | --- |)
      if (trimmedLine.includes('---')) continue;

      inTable = true;
      const cells = trimmedLine
        .split('|')
        .filter((c) => c.trim())
        .map((c) => c.trim());
      tableRows.push(cells);
      continue;
    }

    // If we were in a table, render it
    if (inTable && tableRows.length > 0) {
      children.push(createWordTable(tableRows));
      tableRows = [];
      inTable = false;
    }

    // Parse headings
    if (trimmedLine.startsWith('### ')) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.substring(4),
              font: WORD_FONT,
              bold: true,
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 300, after: 100 },
        })
      );
    } else if (trimmedLine.startsWith('## ')) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.substring(3),
              font: WORD_FONT,
              bold: true,
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 150 },
        })
      );
    } else if (trimmedLine.startsWith('# ')) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmedLine.substring(2),
              font: WORD_FONT,
              bold: true,
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 500, after: 200 },
        })
      );
    } else if (trimmedLine.startsWith('【') || trimmedLine === '---') {
      // Japanese section headers or horizontal rule
      if (trimmedLine === '---') {
        children.push(
          new Paragraph({
            border: {
              bottom: {
                color: 'auto',
                space: 1,
                size: 6,
                style: BorderStyle.SINGLE,
              },
            },
            spacing: { before: 200, after: 200 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: trimmedLine, font: WORD_FONT, bold: true }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 150 },
          })
        );
      }
    } else if (trimmedLine.startsWith('- ')) {
      // Bullet point
      children.push(
        new Paragraph({
          children: parseInlineFormatting(trimmedLine.substring(2)),
          bullet: { level: 0 },
          spacing: { before: 50, after: 50 },
        })
      );
    } else if (/^\d+\.\s/.test(trimmedLine)) {
      // Numbered list
      const text = trimmedLine.replace(/^\d+\.\s/, '');
      children.push(
        new Paragraph({
          children: parseInlineFormatting(text),
          numbering: { level: 0, reference: 'default-numbering' },
          spacing: { before: 50, after: 50 },
        })
      );
    } else {
      // Regular paragraph
      children.push(
        new Paragraph({
          children: parseInlineFormatting(trimmedLine),
          spacing: { before: 100, after: 100 },
        })
      );
    }
  }

  // Handle any remaining table
  if (inTable && tableRows.length > 0) {
    children.push(createWordTable(tableRows));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: 'start',
            },
          ],
        },
      ],
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
