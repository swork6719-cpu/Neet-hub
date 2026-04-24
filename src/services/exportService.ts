import { jsPDF } from "jspdf";
import { MCQ } from "./geminiService";

export function exportMCQsToPdf(title: string, mcqs: MCQ[]): void {
  const doc = new jsPDF();
  let yOffset = 20;
  const margin = 20;
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;

  // Title
  doc.setFontSize(20);
  doc.text(title, margin, yOffset);
  yOffset += 15;

  doc.setFontSize(12);

  mcqs.forEach((mcq, index) => {
    // Check for page break
    if (yOffset > pageHeight - 30) {
      doc.addPage();
      yOffset = 20;
    }

    // Question
    doc.setFont("helvetica", "bold");
    const questionLines = doc.splitTextToSize(`Q${index + 1}: ${mcq.question}`, pageWidth - 2 * margin);
    doc.text(questionLines, margin, yOffset);
    yOffset += (questionLines.length * 7);

    // Options
    doc.setFont("helvetica", "normal");
    mcq.options.forEach((option, optIdx) => {
      const label = String.fromCharCode(65 + optIdx); // A, B, C, D
      const optionText = `${label}. ${option}`;
      const optionLines = doc.splitTextToSize(optionText, pageWidth - 2 * margin - 10);
      doc.text(optionLines, margin + 5, yOffset);
      yOffset += (optionLines.length * 7);
    });

    yOffset += 5; // Spacing before next question
  });

  // Answers Section
  doc.addPage();
  yOffset = 20;
  doc.setFontSize(18);
  doc.text("Answer Key & Explanations", margin, yOffset);
  yOffset += 15;
  doc.setFontSize(10);

  mcqs.forEach((mcq, index) => {
    if (yOffset > pageHeight - 30) {
      doc.addPage();
      yOffset = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.text(`Q${index + 1} Correct Answer: ${mcq.correctAnswer}`, margin, yOffset);
    yOffset += 7;
    
    doc.setFont("helvetica", "italic");
    const explanationLines = doc.splitTextToSize(`Explanation: ${mcq.explanation}`, pageWidth - 2 * margin);
    doc.text(explanationLines, margin, yOffset);
    yOffset += (explanationLines.length * 6) + 5;
  });

  doc.save(`${title.replace(/\s+/g, '_')}_MCQs.pdf`);
}
