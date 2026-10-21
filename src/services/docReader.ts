import mammoth from 'mammoth';

export async function readDocumentFile(file: File): Promise<{ fileName: string; text: string; preview: string }> {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  let text = '';

  // Requisito 32: acepta .txt, .md y .docx sin importar mayúsculas; otro formato muestra "Formato no soportado"
  if (lowerName.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    text = result.value;
  } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    text = await file.text();
  } else {
    throw new Error('Formato no soportado');
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
