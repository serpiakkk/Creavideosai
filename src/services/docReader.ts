import mammoth from 'mammoth';

export async function readDocumentFile(file: File): Promise<{ fileName: string; text: string; preview: string }> {
  const fileName = file.name;
  let text = '';

  if (fileName.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    text = result.value;
  } else {
    text = await file.text();
  }

  const cleanText = text.trim();
  const firstLines = cleanText.split('\n').slice(0, 4).join('\n');
  const preview = firstLines.length > 180 ? `${firstLines.slice(0, 180)}...` : firstLines;

  return {
    fileName,
    text: cleanText,
    preview,
  };
}
